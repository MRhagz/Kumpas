import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovedProfile } from "@/types";
import { AGENT_SILO_MAP, AGENT_SOURCE_MAP } from "@/lib/module3/types";
import type { AgentName, RetrievedChunk } from "@/lib/module3/types";

const boundary = vi.hoisted(() => ({
  rpc: vi.fn(), embed: vi.fn(), generate: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { rpc: boundary.rpc } }));
vi.mock("@/lib/module3/query-embedding-service", () => ({
  queryEmbeddingService: { embed: boundary.embed },
}));
vi.mock("@google/genai", () => ({ GoogleGenAI: class {
  models = { generateContent: boundary.generate };
} }));

import { vectorStoreQueryService } from "@/lib/module3/vector-store-query-service";
import { academicAuditorAgent } from "@/lib/module3/academic-auditor-agent";
import { industryAnalystAgent } from "@/lib/module3/industry-analyst-agent";
import { feasibilityStrategistAgent } from "@/lib/module3/feasibility-strategist-agent";

const vector = Array(768).fill(0.25);
const specialists = [
  ["AcademicAuditor", academicAuditorAgent],
  ["IndustryAnalyst", industryAnalystAgent],
  ["FeasibilityStrategist", feasibilityStrategistAgent],
] as const;
const fixtures: RetrievedChunk[] = Object.entries(AGENT_SOURCE_MAP).flatMap(([agent, sources]) =>
  sources.map((source) => ({
    silo_id: AGENT_SILO_MAP[agent as AgentName], source_type: source,
    source_url: `https://example.gov.ph/${source}`, official_source_url: null,
    chunk_index: 7, content: `SENTINEL_${source}`, acquisition_method: "automated_pdf",
    source_metadata: { title: source }, ingestion_timestamp: "2026-10-01T00:00:00Z",
    publication_date: null, similarity: 1, embedding_model: "gemini-embedding-001",
    embedding_dimensions: 768,
  })),
);
const profile: ApprovedProfile = {
  sessionId: "PRIVATE_SESSION_REFERENCE", sessionTimestamp: "2026-11-01T00:00:00Z",
  counselorNotes: {
    careerGoal: "APPROVED_GOAL", interests: "APPROVED_INTERESTS", financial: "PRIVATE_FINANCIAL_NARRATIVE",
    concerns: "PRIVATE_CONCERNS", impression: "PRIVATE_IMPRESSION",
  },
  academicData: { ncae: { strand_scores: { STEM: 92 }, recommended_strand: "STEM" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EMBEDDING_MODEL", "gemini-embedding-001");
  vi.stubEnv("EMBEDDING_DIMENSIONS", "768");
  boundary.embed.mockResolvedValue(vector);
  boundary.generate.mockResolvedValue({ text: '{"summary":"grounded analysis"}' });
  boundary.rpc.mockImplementation(async (_name, args) => ({
    data: fixtures.filter((chunk) => chunk.silo_id === args.target_silo_id), error: null,
  }));
});

describe("I05 specialist evidence isolation", () => {
  it.each(specialists)("%s uses its assigned evidence and approved profile", async (name, agent) => {
    const approved = structuredClone(profile);
    const result = await agent.analyze(approved, "test-key");
    expect(result.agentName).toBe(name);
    expect(result.retrievedChunks.length).toBeGreaterThan(0);
    expect(result.retrievedChunks.every((chunk) => chunk.silo_id === AGENT_SILO_MAP[name])).toBe(true);
    expect(result.unavailableEvidence).toEqual([]);
    const prompt = boundary.generate.mock.calls[0][0].contents;
    for (const chunk of fixtures) {
      expect(prompt.includes(chunk.content)).toBe(chunk.silo_id === AGENT_SILO_MAP[name]);
      if (chunk.silo_id === AGENT_SILO_MAP[name]) {
        expect(prompt).toContain(chunk.source_url);
        expect(prompt).toContain('"chunk_index":7');
        expect(prompt).toContain('"publication_date":null');
        expect(prompt).toContain(chunk.ingestion_timestamp);
      }
    }
    expect(prompt).toContain("APPROVED_GOAL");
    expect(prompt).not.toContain(profile.sessionId);
    const retrievalQuery = boundary.embed.mock.calls[0][0];
    for (const narrative of Object.values(profile.counselorNotes)) expect(retrievalQuery).not.toContain(narrative);
    expect(JSON.stringify(boundary.rpc.mock.calls)).not.toContain("APPROVED_GOAL");
    expect(boundary.rpc).toHaveBeenCalledWith("match_knowledge_chunks", expect.objectContaining({
      request_agent: name, target_silo_id: AGENT_SILO_MAP[name],
    }));
    expect(approved).toEqual(profile);
  });

  it.each(specialists)("%s rejects every foreign sentinel before generation", async (name, agent) => {
    for (const chunk of fixtures.filter((record) => record.silo_id !== AGENT_SILO_MAP[name])) {
      boundary.rpc.mockResolvedValueOnce({ data: [chunk], error: null });
      await expect(agent.analyze(profile, "test-key")).rejects.toThrow(/knowledge retrieval failed/);
    }
    expect(boundary.generate).not.toHaveBeenCalled();
  });

  it.each(specialists)("%s makes missing evidence explicit without generation", async (_name, agent) => {
    boundary.rpc.mockResolvedValueOnce({ data: [], error: null });
    const result = await agent.analyze(profile, "test-key");
    expect(result.status).toBe("FAILED");
    expect(result.retrievedChunks).toEqual([]);
    expect(result.unavailableEvidence?.length).toBeGreaterThan(0);
    expect(result.analysis).toContain("Public evidence unavailable");
    expect(boundary.generate).not.toHaveBeenCalled();
  });

  it("keeps TESDA in Path Feasibility and explicitly identifies missing CHED evidence", async () => {
    boundary.rpc.mockResolvedValueOnce({ data: fixtures.filter((chunk) => chunk.source_type === "tesda_manual"), error: null });
    const result = await feasibilityStrategistAgent.analyze(profile, "test-key");
    expect(result.unavailableEvidence).toEqual(["ched_cmo: no relevant public evidence retrieved"]);
    expect(boundary.generate.mock.calls[0][0].contents).toContain(result.unavailableEvidence![0]);
  });

  it("rejects unknown and prototype agent names before retrieval", async () => {
    for (const name of ["Other", "toString", "__proto__", null]) {
      await expect(vectorStoreQueryService.query(name as AgentName, vector)).rejects.toThrow(/Routing error/);
    }
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed filters instead of broadening the query", async () => {
    for (const count of [0, -1, NaN, Infinity, 1.5, {}]) {
      await expect(vectorStoreQueryService.query("AcademicAuditor", vector, count as number)).rejects.toThrow(/Invalid vector search limits/);
    }
    for (const threshold of [NaN, Infinity, -1.1, 1.1, {}]) {
      await expect(vectorStoreQueryService.query("AcademicAuditor", vector, 5, threshold as number)).rejects.toThrow(/Invalid vector search limits/);
    }
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("rejects mislabeled source types, invalid fingerprints and mixed result batches", async () => {
    const good = fixtures[0];
    for (const bad of [null, { ...good, source_type: "dole_ble_lmi" },
      { ...good, embedding_model: "unverified" }, { ...good, embedding_dimensions: 3 }]) {
      boundary.rpc.mockResolvedValueOnce({ data: [good, bad], error: null });
      await expect(vectorStoreQueryService.query("AcademicAuditor", vector)).rejects.toThrow(/unauthorized evidence/);
    }
  });

  it("propagates database failure without returning evidence", async () => {
    boundary.rpc.mockResolvedValueOnce({ data: fixtures, error: { message: "database unavailable" } });
    await expect(vectorStoreQueryService.query("AcademicAuditor", vector)).rejects.toThrow(/database unavailable/);
  });
});

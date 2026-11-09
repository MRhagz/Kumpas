import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentOutput, CandidateCareerPath } from "@/lib/module3/types";
import { ProcessingBudget } from "@/lib/processing-budget";
import type { ApprovedProfile } from "@/types";

const boundary = vi.hoisted(() => ({ generate: vi.fn(), from: vi.fn(), rows: [] as Record<string, unknown>[] }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: boundary.generate }; } }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: boundary.from } }));
import { alignmentScoreCalculator } from "@/lib/module3/alignment-score-calculator";
import { parseSynthesis, synthesisInterpreter } from "@/lib/module3/synthesis-interpreter";
import { rankingAgent } from "@/lib/module3/ranking-agent";
import { rankedRecommendationBuilder } from "@/lib/module3/ranked-recommendation-builder";
import { runRecommendationProvider } from "@/lib/module3/recommendation-provider";
import { metaAgentSynthesizer } from "@/lib/module3/meta-agent-synthesizer";
import { evidenceClaims } from "@/lib/report/evidence-summary";

const profile: ApprovedProfile = {
  sessionId: "session", sessionTimestamp: "2026-11-05T00:00:00Z",
  counselorNotes: { careerGoal: "Undecided", interests: "Mathematics", financial: "Limited budget", concerns: "", impression: "" },
  academicData: { nat: { subjects: { Mathematics: 80 } } },
};
const outputs: AgentOutput[] = ["AcademicAuditor", "IndustryAnalyst", "FeasibilityStrategist"].map((name) => ({
  agentName: name as AgentOutput["agentName"], status: "SUCCESS", analysis: '{"summary":"Supported analysis"}',
  retrievedChunks: [{ silo_id: "test", source_url: `https://example.gov.ph/${name}`, chunk_index: 0,
    content: "Evidence", acquisition_method: "automated_pdf", source_metadata: { title: name },
    ingestion_timestamp: "2026-11-01T00:00:00Z", similarity: 1, source_type: "test",
    official_source_url: null, publication_date: null, embedding_model: "test", embedding_dimensions: 768 }],
}));
function candidate(careerPath = "Alpha", a: number | null = 80, d: number | null = 60, f: number | null = 90): CandidateCareerPath {
  return { careerPath, aptitudeScore: a, demandScore: d, feasibilityScore: f,
    signals: ["Supported signal"], keySignalDetails: [], sourceReferences: [],
    componentEvidence: {
      aptitude: a === null ? null : { inputReferences: ["academicData.nat.subjects.Mathematics"], sourceReferences: [], explanation: "Academic fit" },
      demand: d === null ? null : { inputReferences: [], sourceReferences: [{ reference: outputs[1].retrievedChunks[0].source_url, chunkIndex: 0 }], explanation: "Labor demand" },
      feasibility: f === null ? null : { inputReferences: ["counselorNotes.financial"], sourceReferences: [{ reference: outputs[2].retrievedChunks[0].source_url, chunkIndex: 0 }], explanation: "Costs and budget" },
    } };
}

beforeEach(() => {
  vi.clearAllMocks(); boundary.rows = [];
  vi.stubEnv("SYNTHESIS_API_KEY", "test-key");
  boundary.from.mockImplementation((table) => ({
    delete: () => ({ eq: async () => ({ error: null }) }),
    insert: async (rows: Record<string, unknown>[]) => { if (table === "ranked_recommendations") boundary.rows = rows; return { error: null }; },
  }));
});

describe("U01 / F08 deterministic scoring", () => {
  it.each([[80, 60, 90, 74.5], [85, 90, 75, 84.5], [80, 88, 65, 79.45], [75, 82, 50, 71.55],
    [0, 0, 0, 0], [100, 100, 100, 100], [74.505, 74.505, 74.505, 74.51], [1.005, 1.005, 1.005, 1.01]])("calculates %s/%s/%s = %s", (a, d, f, expected) => {
    expect(alignmentScoreCalculator.calculate({ candidates: [candidate("Alpha", a, d, f)] })[0].alignmentScore).toBe(expected);
  });
  it("rounds before ordering, shares competition ranks and sorts ties alphabetically", () => {
    const result = alignmentScoreCalculator.calculate({ candidates: [candidate("Beta", 74.504, 74.504, 74.504), candidate("Lower", 70, 70, 70), candidate("Alpha", 74.503, 74.503, 74.503)] });
    expect(result.map((p) => [p.careerPath, p.alignmentScore, p.rank])).toEqual([["Alpha", 74.5, 1], ["Beta", 74.5, 1], ["Lower", 70, 3]]);
  });
  it.each(["aptitudeScore", "demandScore", "feasibilityScore"] as const)("withholds totals and rank when %s is missing", (field) => {
    const partial = { ...candidate(), [field]: null };
    const result = alignmentScoreCalculator.calculate({ candidates: [partial] })[0];
    expect(result.alignmentScore).toBeNull(); expect(result.rank).toBeNull();
  });
});

describe("F09 model validation and evidence", () => {
  it.each([null, {}, { candidates: {} }, { candidates: [null] }, { candidates: [{ ...candidate(), signals: "bad" }] }])("rejects malformed structure %j", async (response) => {
    boundary.generate.mockResolvedValue({ text: JSON.stringify(response) });
    await expect(synthesisInterpreter.synthesize(outputs, profile)).rejects.toThrow(/Invalid synthesis/);
  });
  it.each([-1, 101, "80", true])("rejects an invalid score %j instead of clamping/coercing", async (score) => {
    boundary.generate.mockResolvedValue({ text: JSON.stringify({ candidates: [{ ...candidate(), aptitudeScore: score }] }) });
    await expect(synthesisInterpreter.synthesize(outputs, profile)).rejects.toThrow(/score/i);
  });
  it("withholds unsupported dimensions, including invented inputs and sources", async () => {
    const c = candidate(); c.componentEvidence.aptitude!.inputReferences = ["academicData.ncae.overall_percentile"];
    c.componentEvidence.demand!.sourceReferences[0].reference = "https://invented.example/";
    boundary.generate.mockResolvedValue({ text: JSON.stringify({ candidates: [c] }) });
    const result = await synthesisInterpreter.synthesize(outputs, profile);
    expect(result.candidates[0]).toMatchObject({ aptitudeScore: null, demandScore: null, feasibilityScore: 90 });
  });
  it.each([NaN, Infinity, -Infinity, undefined])("rejects nonfinite or absent scores %s", (score) => {
    expect(() => parseSynthesis({ candidates: [{ ...candidate(), demandScore: score }] }, outputs, profile)).toThrow(/score/i);
  });
  it.each([84.5, 79.45, 71.55])("preserves recorded pipeline precision %s through synthesis and storage", async (score) => {
    boundary.generate.mockResolvedValue({ text: JSON.stringify({ candidates: [candidate("Alpha", score, score, score)] }) });
    const synthesis = await synthesisInterpreter.synthesize(outputs, profile);
    const scored = alignmentScoreCalculator.calculate(synthesis);
    const list = await rankedRecommendationBuilder.build("session", scored.map((p) => ({ ...p, reasoningSummary: "Explanation" })), outputs, 2);
    expect(list.recommendations[0].alignmentScore).toBe(score);
    expect(boundary.rows[0]).toMatchObject({ alignment_score: score, approved_profile_version: 2, score_weights: { aptitude: 0.35, demand: 0.4, feasibility: 0.25 } });
  });
  it("never substitutes another specialist for a failed dimension", async () => {
    boundary.generate.mockResolvedValue({ text: JSON.stringify({ candidates: [candidate()] }) });
    const result = await synthesisInterpreter.synthesize(outputs.map((o) => o.agentName === "FeasibilityStrategist" ? { ...o, status: "FAILED" } : o), profile);
    expect(result.candidates[0].feasibilityScore).toBeNull();
  });
  it("deduplicates names and allows fewer than three supported paths", async () => {
    boundary.generate.mockResolvedValue({ text: JSON.stringify({ candidates: [candidate(), candidate(" alpha "), candidate("Beta")] }) });
    const result = await synthesisInterpreter.synthesize(outputs, profile);
    expect(result.candidates.map((c) => c.careerPath)).toEqual(["Alpha", "Beta"]);
    const prompt = boundary.generate.mock.calls[0][0].contents;
    expect(prompt).toContain("0–100"); expect(prompt).not.toContain("Produce at least 3");
  });
  it("explanations cannot override totals, components, rank or order", async () => {
    const scored = alignmentScoreCalculator.calculate({ candidates: [candidate("Beta", 74.504, 74.504, 74.504), candidate("Alpha", 74.503, 74.503, 74.503)] });
    boundary.generate.mockResolvedValue({ text: JSON.stringify({ rankings: scored.map((path) => ({ careerPath: path.careerPath, claims: evidenceClaims(path), reasoningSummary: "Model prefers Beta", alignmentScore: 100, rank: 1 })) }) });
    const result = await rankingAgent.generateReasoning(scored);
    expect(result.map((p) => ({ ...p, reasoningSummary: undefined }))).toEqual(scored.map((p) => ({ ...p, reasoningSummary: undefined })));
  });
  it("persists two scored paths and a separate unscored comparison without inventing a third score", async () => {
    const scored = alignmentScoreCalculator.calculate({ candidates: [candidate("Partial", 80, 60, null), candidate("Beta"), candidate("Alpha")] });
    const list = await rankedRecommendationBuilder.build("session", scored.map((p) => ({ ...p, reasoningSummary: "Explanation" })), outputs);
    expect(list.recommendations.map((p) => [p.careerPath, p.rank])).toEqual([["Alpha", 1], ["Beta", 1], ["Partial", null]]);
    expect(list.recommendations[2]).toMatchObject({ alignmentScore: null, financialFeasibility: null, status: "incomplete" });
    expect(list.recommendations[2].incompleteReason).toContain("feasibility");
    expect(boundary.rows[2]).toMatchObject({ rank: null, alignment_score: null, financial_feasibility: null });
  });
  it("publishes a version-bound score contract without legacy writes inside the shared run", async () => {
    boundary.generate.mockResolvedValueOnce({ text: JSON.stringify({ candidates: [candidate()] }) })
      .mockImplementationOnce(async ({ contents }) => ({ text: JSON.stringify({ rankings: JSON.parse(contents.split("Evidence: ")[1]).map(({ careerPath, claims }: { careerPath: string; claims: unknown[] }) => ({ careerPath, claims })) }) }));
    const list = await metaAgentSynthesizer.synthesize("session", outputs, profile, 2, new ProcessingBudget(), false);
    expect(list).toMatchObject({ scoreContract: "0-100-v1", recommendations: [{ alignmentScore: 74.5, rank: 1, approvedProfileVersion: 2 }] });
    expect(list.recommendations[0].componentEvidence?.aptitude?.inputReferences).toEqual(candidate().componentEvidence.aptitude!.inputReferences);
    expect(list.recommendations[0].componentEvidence?.aptitude?.explanation).toContain("Aptitude comparison 80/100");
    expect(boundary.from).not.toHaveBeenCalled();
    expect(await runRecommendationProvider(profile, list).getRankedRecommendations("session")).toEqual(list);
    expect(() => runRecommendationProvider(profile, { ...list, scoreContract: undefined })).toThrow(/Legacy scoring contract/);
  });
  it.each([{ candidates: [] }, { candidates: [candidate("Unsupported", null, null, null)] }])("returns insufficient evidence without explanation calls or successful persistence: %j", async ({ candidates }) => {
    boundary.generate.mockResolvedValue({ text: JSON.stringify({ candidates }) });
    await expect(metaAgentSynthesizer.synthesize("session", outputs, profile)).rejects.toThrow(/Insufficient evidence.*Retry.*End Session/);
    expect(boundary.generate).toHaveBeenCalledTimes(1); expect(boundary.from).not.toHaveBeenCalled();
  });
});

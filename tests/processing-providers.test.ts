import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingBudget, ProviderError } from "@/lib/processing-budget";
import type { ApprovedProfile } from "@/types";
const provider = vi.hoisted(() => ({ embed: vi.fn(), generate: vi.fn(), constructors: vi.fn(), query: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class {
  constructor(options: unknown) { provider.constructors(options); }
  models = { embedContent: provider.embed, generateContent: provider.generate };
} }));
vi.mock("@/lib/module3/vector-store-query-service", () => ({ vectorStoreQueryService: { query: provider.query } }));
import { queryEmbeddingService } from "@/lib/module3/query-embedding-service";
import { academicAuditorAgent } from "@/lib/module3/academic-auditor-agent";
import { synthesisInterpreter } from "@/lib/module3/synthesis-interpreter";
import { rankingAgent } from "@/lib/module3/ranking-agent";
import { requestGeminiImageJson } from "@/lib/module3/gemini-config";
const profile: ApprovedProfile = { sessionId: "s", sessionTimestamp: "2026-11-05T00:00:00Z", academicData: {},
  counselorNotes: { careerGoal: "Undecided", interests: "Science", financial: "", concerns: "", impression: "" } };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); vi.stubEnv("SYNTHESIS_API_KEY", "test");
  provider.embed.mockResolvedValue({ embeddings: [{ values: Array(768).fill(0.1) }] });
  provider.query.mockResolvedValue([{ silo_id: "market_analytics", source_type: "psa_openstat_lfs", source_url: "https://psa.gov.ph", source_metadata: {}, content: "Synthetic evidence", publication_date: null }]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("SW-15 production operation wiring", () => {
  it("image extraction keeps header authentication and Retry-After within the shared budget", async () => {
    vi.stubEnv("DOCUMENT_INTAKE_API_KEY", "synthetic-image-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({}, { status: 429, headers: { "Retry-After": "5" } }))
      .mockResolvedValueOnce(Response.json({ candidates: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = requestGeminiImageJson({ contents: [] }, new ProcessingBudget(), "document extraction");
    await vi.advanceTimersByTimeAsync(4999); expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); await expect(pending).resolves.toEqual({ candidates: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
      expect(options.headers["x-goog-api-key"]).toBe("synthetic-image-key");
      expect(options.redirect).toBe("error");
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it("image extraction includes a hung response body in its deadline", async () => {
    vi.stubEnv("DOCUMENT_INTAKE_API_KEY", "synthetic-image-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) });
    vi.stubGlobal("fetch", fetchMock);
    const pending = requestGeminiImageJson({}, new ProcessingBudget(Date.now() + 1000), "document extraction");
    const checked = expect(pending).rejects.toMatchObject({ code: "deadline", stage: "document extraction" });
    await vi.advanceTimersByTimeAsync(1000); await checked;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["embedding", "specialist", "synthesis", "explanation"] as const)("%s retries only the failed operation and disables SDK retries", async (stage) => {
    const response = stage === "synthesis" ? { text: '{"candidates":[]}' } : stage === "explanation" ? { text: '{"rankings":[]}' } : { text: '{"summary":"synthetic"}' };
    const target = stage === "embedding" ? provider.embed : provider.generate;
    target.mockRejectedValueOnce(new ProviderError(503, "5", {}));
    if (stage !== "embedding") target.mockResolvedValue(response);
    const budget = new ProcessingBudget();
    const pending = stage === "embedding" ? queryEmbeddingService.embed("query", "test", budget) :
      stage === "specialist" ? academicAuditorAgent.analyze(profile, "test", budget) :
      stage === "synthesis" ? synthesisInterpreter.synthesize([], budget) : rankingAgent.generateReasoning([], budget);
    await vi.advanceTimersByTimeAsync(4999); expect(target).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); await pending;
    expect(target).toHaveBeenCalledTimes(2);
    for (const [options] of provider.constructors.mock.calls) expect(options.httpOptions.retryOptions.attempts).toBe(1);
    for (const [request] of target.mock.calls) expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
    if (stage === "specialist") { expect(provider.embed).toHaveBeenCalledTimes(1); expect(provider.query).toHaveBeenCalledTimes(1); }
  });
  it("a specialist's exhausted embedding retry is not retried by the dispatcher", async () => {
    vi.stubEnv("ACADEMIC_AUDITOR_API_KEY", "test"); vi.stubEnv("INDUSTRY_ANALYST_API_KEY", "test"); vi.stubEnv("FEASIBILITY_STRATEGIST_API_KEY", "test");
    provider.embed.mockRejectedValue(new ProviderError(503, null, {}));
    const { agentDispatcher } = await import("@/lib/module3/agent-dispatcher");
    const pending = agentDispatcher.dispatch({ sessionId: "s", approvedProfile: profile }, new ProcessingBudget());
    await vi.advanceTimersByTimeAsync(2000);
    const outputs = await pending;
    expect(outputs.every((output) => output.status === "FAILED")).toBe(true);
    expect(provider.embed).toHaveBeenCalledTimes(6); // 2 per independent specialist, no outer retry.
    expect(provider.generate).not.toHaveBeenCalled();
  });
});


it("SW-08 excludes correction audits from actual specialist Gemini requests", async () => {
  provider.generate.mockResolvedValue({ text: '{"summary":"synthetic"}' });
  const withAudits = { ...profile, academicData: { ncae: { strand_scores: { STEM: 90 }, correction_logs: "AUDIT_SENTINEL" } },
    correction_logs: [{ extracted_value: "AUDIT_SENTINEL", corrected_value: "CORRECTION_SENTINEL" }] };
  await academicAuditorAgent.analyze(withAudits, "test", new ProcessingBudget());
  expect(provider.generate).toHaveBeenCalled();
  expect(JSON.stringify(provider.generate.mock.calls)).not.toContain("AUDIT_SENTINEL");
  expect(JSON.stringify(provider.generate.mock.calls)).not.toContain("CORRECTION_SENTINEL");
});

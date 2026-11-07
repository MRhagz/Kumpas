import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ProcessingBudget } from "@/lib/processing-budget";
const m = vi.hoisted(() => ({ dispatch: vi.fn(), synthesize: vi.fn(), load: vi.fn(), transition: vi.fn(), fail: vi.fn(), profile: vi.fn() }));
vi.mock("@/lib/auth/api-auth", () => ({ requireUser: async () => ({ id: "owner" }), userOwnsSession: async () => true }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/module3/agent-dispatcher", () => ({ agentDispatcher: { dispatch: m.dispatch } }));
vi.mock("@/lib/module3/meta-agent-synthesizer", () => ({ metaAgentSynthesizer: { synthesize: m.synthesize } }));
vi.mock("@/lib/module5/processing-run", () => ({ loadProcessingRun: m.load, transitionRun: m.transition, failRun: m.fail,
  approvedRunProfile: m.profile, runBudget: () => new ProcessingBudget() }));
import { POST } from "@/app/api/sessions/[sessionId]/analyze/route";
import { InsufficientEvidenceError } from "@/lib/module3/alignment-score-calculator";

const run = { session_id: "session", counselor_id: "owner", run_id: "run", approved_profile_version: 2, phase: "pending", status: "running" };
const profile = { academicData: {}, counselorNotes: {} };
const request = () => POST(new NextRequest("https://example.test/api/sessions/session/analyze", {
  method: "POST", body: JSON.stringify({ runId: "run", profileVersion: 2 }),
}), { params: Promise.resolve({ sessionId: "session" }) });
beforeEach(() => {
  vi.clearAllMocks();
  m.load.mockResolvedValue({ run, reportVersion: 0 });
  m.transition.mockResolvedValue({ ...run, phase: "analysis" });
  m.profile.mockResolvedValue(profile);
  m.dispatch.mockResolvedValue([{ status: "SUCCESS" }]);
});
it("returns actionable insufficient evidence without publishing recommendations", async () => {
  m.synthesize.mockRejectedValue(new InsufficientEvidenceError());
  const result = await request();
  expect(result.status).toBe(422);
  expect((await result.json()).error).toMatch(/Insufficient evidence.*Retry or End Session/);
  expect(m.fail).toHaveBeenCalledOnce();
  expect(m.transition.mock.calls.map(([, action]) => action)).toEqual(["claim_analysis"]);
});
it("passes the immutable approved profile/version and the run budget without legacy writes", async () => {
  m.synthesize.mockResolvedValue({ recommendations: [], scoreContract: "0-100-v1" });
  await request();
  expect(m.synthesize).toHaveBeenCalledWith("session", [{ status: "SUCCESS" }], profile, 2, expect.any(ProcessingBudget), false);
  expect(m.transition.mock.calls.map(([, action]) => action)).toEqual(["claim_analysis", "analysis_ready"]);
});

it("withholds raw legacy explanations when an already-completed analysis is resumed", async () => {
  const raw = "RAW_REASONING_SHOULD_NOT_BE_EXPOSED";
  m.load.mockResolvedValue({ run: { ...run, phase: "report_pending", recommendations: { sessionId: "session", generatedAt: "2026-11-07T00:00:00Z",
    recommendations: [{ id: "legacy", careerPath: "Synthetic option", rank: 1, alignmentScore: 74.5, aptitudeFit: 80, marketDemand: 60, financialFeasibility: 90,
      reasoningSummary: raw, keySignals: [raw], keySignalDetails: [], sources: [], status: "complete" }] } }, reportVersion: 0 });
  const response = await request(), body = await response.json();
  expect(response.status).toBe(200);
  expect(JSON.stringify(body)).not.toContain(raw);
  expect(body.rankedRecommendations.recommendations[0].reasoningSummary).toContain("Evidence summary unavailable");
  expect(m.dispatch).not.toHaveBeenCalled();
});

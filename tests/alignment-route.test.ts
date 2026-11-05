import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ dispatch: vi.fn(), synthesize: vi.fn(), progress: vi.fn(), complete: vi.fn(), failed: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/auth/api-auth", () => ({ requireUser: async () => ({ id: "owner" }), userOwnsSession: async () => true }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: m.single }) }) }) } }));
vi.mock("@/lib/module3/agent-dispatcher", () => ({ agentDispatcher: { dispatch: m.dispatch } }));
vi.mock("@/lib/module3/meta-agent-synthesizer", () => ({ metaAgentSynthesizer: { synthesize: m.synthesize } }));
vi.mock("@/lib/module5/session-progress", () => ({ sessionProgressTracker: { markAnalysisInProgress: m.progress, markAnalysisComplete: m.complete, markAnalysisFailed: m.failed } }));
import { POST } from "@/app/api/sessions/[sessionId]/analyze/route";
import { InsufficientEvidenceError } from "@/lib/module3/alignment-score-calculator";

beforeEach(() => {
  vi.clearAllMocks();
  m.single.mockResolvedValue({ data: { approved_profile: { academicData: {}, counselorNotes: {} }, current_profile_version: 2 }, error: null });
  m.dispatch.mockResolvedValue([{ status: "SUCCESS" }]);
});
it("returns actionable insufficient evidence without marking analysis complete", async () => {
  m.synthesize.mockRejectedValue(new InsufficientEvidenceError());
  const result = await POST(new NextRequest("https://example.test/api/sessions/session/analyze", { method: "POST" }), { params: Promise.resolve({ sessionId: "session" }) });
  expect(result.status).toBe(422);
  expect((await result.json()).error).toMatch(/Insufficient evidence.*Retry or End Session/);
  expect(m.failed).toHaveBeenCalledWith("session"); expect(m.complete).not.toHaveBeenCalled();
});
it("passes the actual approved profile and version to synthesis", async () => {
  m.synthesize.mockResolvedValue({ recommendations: [] });
  await POST(new NextRequest("https://example.test/api/sessions/session/analyze", { method: "POST" }), { params: Promise.resolve({ sessionId: "session" }) });
  expect(m.synthesize).toHaveBeenCalledWith("session", [{ status: "SUCCESS" }], { academicData: {}, counselorNotes: {} }, 2);
});

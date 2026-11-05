import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingBudget, ProviderError } from "@/lib/processing-budget";
const mocks = vi.hoisted(() => ({ load: vi.fn(), transition: vi.fn(), fail: vi.fn(), profile: vi.fn(), assemble: vi.fn(), render: vi.fn(), upload: vi.fn(), download: vi.fn(), remove: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/auth/api-auth", () => ({ requireUser: async () => ({ id: "owner" }), userOwnsSession: async () => true,
  notFoundResponse: () => Response.json({}, { status: 404 }), unauthorizedResponse: () => Response.json({}, { status: 401 }) }));
vi.mock("@/lib/module5/processing-run", () => ({ loadProcessingRun: mocks.load, transitionRun: mocks.transition, failRun: mocks.fail,
  approvedRunProfile: mocks.profile, runBudget: (run: { deadline_at: string }) => new ProcessingBudget(Date.parse(run.deadline_at)) }));
vi.mock("@/lib/report/assembler", () => ({ assembleReportData: mocks.assemble, ReportAssemblyError: class extends Error {} }));
vi.mock("@/lib/report/pdf-renderer", () => ({ renderReportPdf: mocks.render }));
vi.mock("@/lib/module3/recommendation-provider", () => ({ runRecommendationProvider: vi.fn() }));
vi.mock("@/lib/report/file-store", () => ({ normalizeReportSessionId: (id: string) => id, pdfFileStore: { uploadReportPdf: mocks.upload, downloadReportPdf: mocks.download, deleteReportPdf: mocks.remove } }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => { const query = { select: () => query, eq: () => query, in: () => query, gt: () => query, single: mocks.single, maybeSingle: mocks.maybeSingle }; return query; } } }));
import { POST } from "@/app/api/reports/route";
const request = (runId = "run") => POST(new Request("http://localhost/api/reports", { method: "POST", body: JSON.stringify({ sessionId: "session", runId }) }));
const run = () => ({ run_id: "run", session_id: "session", counselor_id: "owner", approved_profile_version: 1,
  phase: "report_pending", status: "running", deadline_at: new Date(Date.now() + 300000).toISOString(), recommendations: { sessionId: "session", recommendations: [] } });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-05T00:00:00Z")); vi.clearAllMocks();
  mocks.load.mockResolvedValue({ run: run(), reportVersion: 0 }); mocks.transition.mockImplementation(async (value) => ({ ...value, candidate_report_version: 1 }));
  mocks.profile.mockResolvedValue({}); mocks.assemble.mockResolvedValue({ rankedRecommendations: { recommendations: [] }, academicEvidence: {} });
  mocks.render.mockResolvedValue(Buffer.from("%PDF synthetic")); mocks.upload.mockResolvedValue({ byteLength: 14 });
  mocks.download.mockResolvedValue(new Blob(["%PDF synthetic"])); mocks.remove.mockResolvedValue(undefined);
  mocks.single.mockResolvedValue({ data: { generated_at: "2026-11-05T00:01:00Z", expires_at: "2026-11-06T00:01:00Z" }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
});
afterEach(() => { vi.useRealTimers(); });

describe("SW-15 PDF-ready budget boundary", () => {
  it("retries a transient PDF/storage failure once within the original run", async () => {
    mocks.upload.mockRejectedValueOnce(new ProviderError(503, "5", {}));
    const pending = request();
    await vi.advanceTimersByTimeAsync(4999); expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.transition.mock.calls.some(([, action]) => action === "report_ready")).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const response = await pending; expect(response.status).toBe(200);
    expect(mocks.render).toHaveBeenCalledTimes(2); expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.upload.mock.calls[0][3]).toBeInstanceOf(AbortSignal);
    expect(mocks.transition.mock.calls.map(([, action]) => action)).toEqual(["claim_report", "report_ready"]);
  });
  it("exhausts the shared budget during rendering and never uploads or publishes a late PDF", async () => {
    mocks.load.mockResolvedValue({ run: { ...run(), deadline_at: new Date(Date.now() + 1000).toISOString() }, reportVersion: 0 });
    mocks.render.mockImplementation(async () => { await new Promise((resolve) => setTimeout(resolve, 2000)); return Buffer.from("late PDF"); });
    const pending = request(); await vi.advanceTimersByTimeAsync(1000);
    const response = await pending; expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ failedStage: "PDF generation and storage", retryRunId: "run" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.transition.mock.calls.map(([, action]) => action)).toEqual(["claim_report"]);
    expect(mocks.fail).toHaveBeenCalledOnce();
  });
  it("rejects an old browser run token without changing current progress", async () => {
    expect((await request("old-run")).status).toBe(409);
    expect(mocks.render).not.toHaveBeenCalled(); expect(mocks.transition).not.toHaveBeenCalled(); expect(mocks.fail).not.toHaveBeenCalled();
  });
  it("serves an already-ready draft without restarting generation or its expired processing timer", async () => {
    mocks.load.mockResolvedValue({ run: { ...run(), phase: "ready", status: "completed", deadline_at: "2026-11-04T00:00:00Z" }, reportVersion: 1 });
    const response = await request(); expect(response.status).toBe(200);
    expect((await response.json()).generatedAt).toBe("2026-11-05T00:01:00Z");
    expect(mocks.render).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.transition).not.toHaveBeenCalled();
  });
  it("does not open a ready run's missing or stale report version", async () => {
    mocks.load.mockResolvedValue({ run: { ...run(), phase: "ready", status: "completed" }, reportVersion: 1 });
    mocks.single.mockResolvedValue({ data: null, error: null });
    expect((await request()).status).toBe(409);
    expect(mocks.assemble).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});

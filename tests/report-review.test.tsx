// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import AnalysisPage from "@/components/analysis/analysis-page";
import type { ReportGenerationResponse } from "@/lib/report/types";

const m = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => m.router, useSearchParams: () => new URLSearchParams("session=session") }));
vi.mock("@/components/auth/protected-header", () => ({ default: () => null }));
vi.mock("@/components/session/session-progress-indicator", () => ({ default: () => null }));
vi.mock("@/components/analysis/loading-screen", () => ({ default: () => <p>Processing</p> }));

let report: ReportGenerationResponse;
let currentRun: string;
let reviewResponse: ((decision: string) => Promise<Response>) | undefined;
const runId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const json = (body: unknown, status = 200) => Promise.resolve(Response.json(body, { status }));
const requestDecision = async (name: string) => act(async () => { fireEvent.click(screen.getByRole("button", { name })); });
async function mount() {
  render(<AnalysisPage />);
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-07T10:00:00Z")); vi.clearAllMocks();
  currentRun = runId; reviewResponse = undefined;
  report = { sessionId: "session", runId, reportVersion: 2, approvedProfileVersion: 3, reviewStatus: "draft",
    previewUrl: "/api/reports/session/preview?version=2", downloadUrl: null,
    generatedAt: "2026-11-07T09:00:00Z", expiresAt: "2026-11-08T09:00:00Z", byteLength: 100,
    recommendationCount: 0, recommendations: [], academicEvidence: { availableDocuments: [], missingDocuments: ["form137", "ncae", "nat"], completenessNote: "No academic documents provided." },
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/reports") return json(report);
    if (url.endsWith("/review")) {
      const { decision } = JSON.parse(String(options?.body));
      if (reviewResponse) return reviewResponse(decision);
      if (decision === "correct") return json({});
      if (decision === "regenerate") {
        currentRun = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
        report = { ...report, runId: currentRun, reportVersion: 3, reviewStatus: "draft", downloadUrl: null,
          previewUrl: "/api/reports/session/preview?version=3", reviewedAt: null };
      } else report = { ...report, reviewStatus: decision, downloadUrl: decision === "approved" ? "/api/reports/session?version=2&download=1" : null,
        previewUrl: null, reviewedAt: "2026-11-07T10:00:00Z" };
      return json({ runId: currentRun });
    }
    return json({ sessionId: "session", currentRunId: currentRun, profileVersion: 3,
      currentReportVersion: report.reportVersion, reportReviewStatus: report.reviewStatus,
      hasApprovedProfile: true, nextStep: "report", reportStatus: "ready" });
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("previews a draft, unlocks only server-approved download, and blocks an old tab on focus", async () => {
  await mount();
  expect(screen.getByRole("link", { name: "Preview Draft PDF" }).getAttribute("href")).toContain("preview?version=2");
  expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
  await requestDecision("Approve report v2");
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/complete"))).toBe(false);
  currentRun = "newer-run";
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(screen.getByText(/This report changed or expired/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
});

it("restores rejection and explicitly regenerates a new draft requiring fresh approval", async () => {
  await mount(); await requestDecision("Reject report");
  expect(screen.getByText(/This version was rejected/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Approve report v2" })).toBeNull();
  cleanup(); await mount();
  expect(screen.getByText(/This version was rejected/)).toBeTruthy();
  await requestDecision("Regenerate report");
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(screen.getByRole("button", { name: "Approve report v3" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
  await requestDecision("Correct Inputs");
  expect(m.router.push).toHaveBeenCalledWith("/input?session=session&edit=1");
});

it("keeps an ambiguous review locked until canonical state is reloaded", async () => {
  reviewResponse = async () => {
    report = { ...report, reviewStatus: "approved", previewUrl: null, downloadUrl: "/api/reports/session?version=2&download=1" };
    return Response.json({ error: "Response lost; reload before retrying." }, { status: 502 });
  };
  await mount(); await requestDecision("Approve report v2");
  expect(screen.getByRole("alert").textContent).toContain("Response lost");
  expect((screen.getByRole("button", { name: "Approve report v2" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
  await requestDecision("Reload current report");
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
});

it("does not unlock download from an approval response superseded by another run", async () => {
  let finish!: (value: Response) => void;
  reviewResponse = () => new Promise(resolve => { finish = resolve; });
  await mount(); await requestDecision("Approve report v2");
  currentRun = "newer-run";
  await act(async () => { finish(Response.json({ reviewStatus: "approved" })); });
  expect(screen.getByRole("alert").textContent).toContain("Inputs changed");
  expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
});

it("does not start analysis from a regeneration response superseded by another tab", async () => {
  let finish!: (value: Response) => void;
  reviewResponse = () => new Promise(resolve => { finish = resolve; });
  await mount(); await requestDecision("Regenerate report");
  currentRun = "newer-run";
  await act(async () => { finish(Response.json({ runId: "superseded-regeneration" })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(screen.getByText(/This regeneration was superseded/)).toBeTruthy();
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/analyze"))).toBe(false);
});

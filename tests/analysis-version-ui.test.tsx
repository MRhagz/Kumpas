// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import AnalysisPage from "@/components/analysis/analysis-page";
const m = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => m.router, useSearchParams: () => new URLSearchParams("session=session") }));
vi.mock("@/components/auth/protected-header", () => ({ default: () => null }));
vi.mock("@/components/session/session-progress-indicator", () => ({ default: () => null }));
vi.mock("@/components/analysis/loading-screen", () => ({ default: () => <p>Processing</p> }));
vi.mock("@/components/analysis/report-download-view", () => ({ default: () => <p>Current report</p> }));
vi.mock("@/components/analysis/error-view", () => ({ default: ({ message }: { message: string }) => <p role="alert">{message}</p> }));
const current = { sessionId: "session", profileVersion: 1, currentRunId: "run-1", currentReportVersion: 1, reportReviewStatus: "draft", nextStep: "report", hasApprovedProfile: true, reportStatus: "ready" };
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([false, true])("a delayed report response is displayed only for the current approved run (changed=%s)", async (changed) => {
  let resolveReport!: (response: Response) => void;
  let stateReads = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/reports") return new Promise<Response>((resolve) => { resolveReport = resolve; });
    stateReads++;
    return Response.json(stateReads > 1 && changed
      ? { ...current, profileVersion: 2, currentRunId: null, nextStep: "input", hasApprovedProfile: false } : current);
  }));
  render(<AnalysisPage />);
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(resolveReport).toBeTypeOf("function");
  await act(async () => { resolveReport(Response.json({ sessionId: "session", runId: "run-1", reportVersion: 1, reviewStatus: "draft" })); });
  if (changed) {
    expect(screen.queryByText("Current report")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Inputs changed");
  } else expect(screen.getByText("Current report")).toBeTruthy();
});

it("sends the saved approval/run token when starting analysis", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/analyze")) return Response.json({ error: "Synthetic stop" }, { status: 409 });
    return Response.json({ ...current, nextStep: "analysis", reportStatus: "not_started" });
  }));
  render(<AnalysisPage />);
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("/analyze"));
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ runId: "run-1", profileVersion: 1 });
  expect(screen.queryByRole("link", { name: "Review or correct inputs" })).toBeNull();
  expect(screen.getByRole("button", { name: "End Session" }).getAttribute("data-size")).toBe("sm");
});

it.each(["analysis", "report", "network"])("a hosting interruption during %s preserves actionable recovery", async stage => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/analyze") || url === "/api/reports") {
      if (stage === "network") throw new TypeError("Failed to fetch");
      return new Response("<html>FUNCTION_INVOCATION_TIMEOUT</html>", { status: 504 });
    }
    return Response.json({ ...current, nextStep: stage === "report" ? "report" : "analysis", reportStatus: stage === "report" ? "ready" : "not_started" });
  }));
  render(<AnalysisPage />);
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  const message = screen.getByRole("alert").textContent;
  expect(message).toContain("Vercel Fluid compute");
  expect(message).toContain("300-second");
  expect(message).toContain("saved inputs");
  expect(message).not.toContain("FUNCTION_INVOCATION_TIMEOUT");
});

// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import Progress from "@/components/session/session-progress-indicator";
const state = { expiresAt: "2099-01-01T00:00:00Z", hasApprovedProfile: true, hasReport: true, nextStep: "report", reportReviewStatus: "draft" };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function current() { return document.querySelector('[aria-current="step"]')?.textContent; }
it("five stages follow server approval and review, never the route fallback; focus reveals invalidated inputs", async () => {
  let saved = state;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(saved)));
  const view = render(<Progress sessionId="s" fallbackStep="report" />);
  await waitFor(() => expect(current()).toContain("Review Report"));
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
  saved = { ...state, reportReviewStatus: "approved" };
  view.rerender(<Progress sessionId="s" fallbackStep="report" refreshToken="approved" />);
  await waitFor(() => expect(current()).toContain("Download"));
  saved = { ...state, hasApprovedProfile: false, hasReport: false, nextStep: "input" };
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(current()).toContain("Intake");
  expect(screen.queryAllByText("Complete")).toHaveLength(0);
});
it("saved intake may enter confirmation without marking approval complete", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...state, hasApprovedProfile: false })));
  render(<Progress sessionId="s" fallbackStep="upload" confirming />);
  await waitFor(() => expect(current()).toContain("Confirm Information"));
  expect(screen.getAllByText("Pending")).toHaveLength(3);
});
it.each([401, 404, 500])("interruption/status %i clears completed stages rather than trusting cached report state", async status => {
  let failed = false;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(state, { status: failed ? status : 200 })));
  render(<Progress sessionId="s" fallbackStep="report" />);
  await waitFor(() => expect(current()).toContain("Review Report"));
  failed = true;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(current()).toBeUndefined();
  expect(screen.getByText(/Progress could not be confirmed/)).toBeTruthy();
});
it("expired drafts cannot appear active even on a report URL", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...state, expiresAt: "2000-01-01T00:00:00Z" })));
  render(<Progress sessionId="s" fallbackStep="report" />);
  await screen.findByText(/This draft has expired/);
  expect(current()).toBeUndefined();
});

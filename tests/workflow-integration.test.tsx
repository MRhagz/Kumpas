// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import InputContainer from "@/components/input/input-container";
import AnalysisPage from "@/components/analysis/analysis-page";
import { normalizeAcademicData } from "@/lib/module2/extraction-contract";
const m = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => m.router, useSearchParams: () => new URLSearchParams("session=workflow") }));
vi.mock("@/components/auth/protected-header", () => ({ default: () => null }));
vi.mock("@/components/input/ingestion-freshness-panel", () => ({ default: () => null }));
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// Whole counselor UI with a deterministic HTTP boundary; no real provider, auth or production data.
it.each(["Grade 10", "SHS"].flatMap(grade => Array.from({ length: 8 }, (_, mask) => ({ grade, mask }))))(
  "$grade optional evidence mask=$mask: intake, approval, analysis, review, download, resume and termination", async ({ grade, mask }) => {
    vi.clearAllMocks();
    const notes = { careerGoal: `<p>${grade}: Undecided</p>`, interests: "<p>Mathematics</p>", financial: "", concerns: "", impression: "" };
    const types = ["ncae", "nat", "form_137"] as const;
    const documents = types.flatMap((type, i) => !(mask & (1 << i)) ? [] : [{ id: `doc-${type}`, document_type: type,
      structured_data: normalizeAcademicData(type, {}), original_data: normalizeAcademicData(type, {}),
      draft_revision: 1, evidence_state: "unreadable", provenance: { documentId: `doc-${type}`, page: null } }]);
    let approved = false;
    let reviewed = false;
    let generated = false;
    let terminated = false;
    const state = () => ({ sessionId: "workflow", profileVersion: approved ? 1 : 0, currentRunId: approved ? "run" : null,
      currentReportVersion: generated ? 1 : 0, reportReviewStatus: generated ? reviewed ? "approved" : "draft" : null,
      hasApprovedProfile: approved, hasReport: generated, nextStep: generated ? "report" : approved ? "analysis" : "input",
      expiresAt: "2099-01-01T00:00:00Z", reportStatus: generated ? "ready" : "not_started" });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/intake")) return Response.json({ profileVersion: 0, documents, notes: { ...notes, revision: 0, source: null }, uploadPending: false });
      if (url.endsWith("/approve")) {
        const body = JSON.parse(String(init?.body));
        expect(body.notesReviewed).toBe(true); expect(body.counselorNotes).toEqual(notes);
        expect(body.documents).toHaveLength(documents.length);
        approved = true; return Response.json({ runId: "run" });
      }
      if (url.endsWith("/analyze")) {
        expect(approved).toBe(true);
        return Response.json({ runId: "run", agentStatuses: [], rankedRecommendations: { recommendations: [] } });
      }
      if (url.endsWith("/review")) { expect(generated).toBe(true); reviewed = true; return Response.json({}); }
      if (url === "/api/reports") {
        expect(approved).toBe(true); generated = true;
        return Response.json({ sessionId: "workflow", runId: "run", reportVersion: 1, approvedProfileVersion: 1,
          reviewStatus: reviewed ? "approved" : "draft", previewUrl: "/preview", downloadUrl: reviewed ? "/approved-download" : null,
          expiresAt: "2099-01-02T00:00:00Z", generatedAt: "2099-01-01T00:00:00Z", recommendations: [], recommendationCount: 0,
          academicEvidence: { availableDocuments: [], missingDocuments: ["form137", "ncae", "nat"], completenessNote: "Academic values unavailable; suggestions rely on approved notes." } });
      }
      if (init?.method === "DELETE") { terminated = true; return Response.json({ status: "terminated", cleanupPending: true }); }
      return terminated ? Response.json({}, { status: 404 }) : Response.json(state());
    }));
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this: HTMLAnchorElement) { downloads.push(this.getAttribute("href")!); });
    let view = render(<InputContainer />);
    fireEvent.click(await screen.findByRole("button", { name: "Skip orientation" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /I have read this notice/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to intake" }));
    await screen.findByRole("textbox", { name: "Career Goal (required)" });
    fireEvent.click(screen.getByRole("checkbox", { name: /I have reviewed these notes/ }));
    fireEvent.click(screen.getByRole("button", { name: /Approve Inputs and Begin Analysis/ }));
    await waitFor(() => expect(m.router.push).toHaveBeenCalledWith("/analysis?session=workflow"));
    view.unmount(); view = render(<AnalysisPage />);
    await screen.findByRole("button", { name: "Approve report v1" });
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
    // Interruption at review: remount recovers saved output without another analysis request.
    const before = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/analyze")).length;
    view.unmount(); view = render(<AnalysisPage />);
    await screen.findByRole("button", { name: "Approve report v1" });
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/analyze"))).toHaveLength(before);
    fireEvent.click(screen.getByRole("button", { name: "Approve report v1" }));
    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));
    expect(downloads).toEqual(["/approved-download"]);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("extract"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "End Session" }));
    await screen.findByRole("alertdialog");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "End session" })); });
    expect(screen.getByText(/Cleanup is pending/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start a new session" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
  });

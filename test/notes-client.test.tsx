import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmationApprovalBar from "@/components/input/confirmation-approval-bar";
import InputContainer from "@/components/input/input-container";

const { push, router } = vi.hoisted(() => { const push = vi.fn(); return { push, router: { push } }; });
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/session/session-progress-indicator", () => ({ default: () => null }));
vi.mock("@/components/input/ingestion-freshness-panel", () => ({ default: () => null }));
// Academic networking is irrelevant to notes-only intake. Any file callback here fails the test.
vi.mock("@/components/input/document-upload-panel", () => ({ default: () => <p>Optional academic documents</p> }));

const notes = { careerGoal: "<b>Undecided</b>", interests: "<ul><li>Mathematics</li></ul>", financial: "", concerns: "", impression: "" };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("F04 client approval", () => {
  it.each(["financial", "concerns", "impression"])("allows a blank %s", (field) => {
    render(<ConfirmationApprovalBar notes={{ ...notes, financial: "Support", concerns: "Reviewed", impression: "Reviewed", [field]: "" }} notesReviewed onNotesReviewedChange={vi.fn()} isSubmitting={false} onApprove={vi.fn()} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  });
  it.each(["careerGoal", "interests"])("blocks an empty %s", (field) => {
    for (const value of ["", " \n ", "<p><br></p>", "<p>&nbsp;&#160;&#xA0;</p>"]) {
      const view = render(<ConfirmationApprovalBar notes={{ ...notes, [field]: value }} notesReviewed onNotesReviewedChange={vi.fn()} isSubmitting={false} onApprove={vi.fn()} />);
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
      view.unmount();
    }
  });
  it("requires review and prevents double submission", () => {
    const view = render(<ConfirmationApprovalBar notes={notes} notesReviewed={false} onNotesReviewedChange={vi.fn()} isSubmitting={false} onApprove={vi.fn()} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<ConfirmationApprovalBar notes={notes} notesReviewed onNotesReviewedChange={vi.fn()} isSubmitting onApprove={vi.fn()} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("F05 / S01 / S02 typed-only intake", () => {
  let outbound: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    push.mockClear();
    outbound = vi.fn(async (url: string) => {
      if (url === "/api/sessions") return Response.json({ sessionId: "test" });
      if (url === "/api/sessions/test/intake") return Response.json({ revision: 1 });
      if (url === "/api/sessions/test/approve") return Response.json({ status: "approved" });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", outbound);
  });
  it.each(["Grade 10 choosing an SHS track", "SHS planning higher education or workforce entry"])("approves %s with no academic uploads or extraction", async (scope) => {
    const user = userEvent.setup();
    render(<InputContainer />);
    await waitFor(() => expect(outbound).toHaveBeenCalled());
    expect(screen.getByRole("complementary", { name: "Processing and privacy notice" })).toBeTruthy();
    expect((document.querySelector("#notes-file-input") as HTMLInputElement).disabled || document.querySelector("fieldset[disabled]")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /I have read this notice/ }));
    await user.click(screen.getByRole("tab", { name: /Manual Input/ }));
    const goal = screen.getByRole("textbox", { name: "Career Goal (required)" });
    const interests = screen.getByRole("textbox", { name: "Personal Interests & Strengths (required)" });
    fireEvent.input(goal, { target: { innerHTML: "<p>Undecided</p>" } });
    fireEvent.input(interests, { target: { innerHTML: `<p>${scope}; mathematics PRIVATE-NOTE-ALPHA</p>` } });
    const approve = screen.getByRole("button", { name: /Approve Inputs and Begin Analysis/ });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    const review = screen.getByRole("checkbox", { name: /I have reviewed these notes/ });
    await user.click(review);
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect((approve as HTMLButtonElement).disabled).toBe(false));
    // Editing after review revokes that confirmation, including removal of confidential text.
    fireEvent.input(interests, { target: { innerHTML: `<p>${scope}; mathematics</p>` } });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByText(/Draft saved/)).toBeTruthy());
    await user.click(review);
    await user.click(approve);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/analysis?session=test"));
    expect(outbound.mock.calls.map(([url]) => url)).toEqual(["/api/sessions", "/api/sessions/test/intake", "/api/sessions/test/intake", "/api/sessions/test/approve"]);
    const payload = JSON.parse(outbound.mock.calls[3][1].body);
    expect(payload).toEqual({ notesReviewed: true, counselorNotes: { ...notes, careerGoal: "<p>Undecided</p>", interests: `<p>${scope}; mathematics</p>` }, corrections: [] });
    expect(JSON.stringify(payload)).not.toContain("PRIVATE-NOTE-ALPHA");
    expect(screen.getByText(/Grade 10 and Senior High School students/)).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import InputContainer from "@/components/input/input-container";
import { normalizeAcademicData } from "@/lib/module2/extraction-contract";
import type { ExtractionDraft } from "@/types";
const m = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn() }, search: "session=saved" }));
vi.mock("next/navigation", () => ({ useRouter: () => m.router, useSearchParams: () => new URLSearchParams(m.search) }));
vi.mock("@/components/session/session-progress-indicator", () => ({ default: () => null }));
vi.mock("@/components/input/ingestion-freshness-panel", () => ({ default: () => null }));
const notes = { careerGoal: "<p>Undecided</p>", interests: "<p>Mathematics</p>", financial: "", concerns: "", impression: "" };
let documents: ExtractionDraft[];
let failSave: boolean;
let uploadPending: boolean;
let savedNotes: typeof notes & { revision: number; source: null; original: null };
beforeEach(() => {
  m.search = "session=saved"; vi.clearAllMocks();
  failSave = false; uploadPending = false; documents = []; savedNotes = { ...notes, revision: 0, source: null, original: null };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/sessions/saved") return Response.json({ sessionId: "saved", nextStep: "input" });
    if (url !== "/api/sessions/saved/intake") throw new Error(`Unexpected request: ${url}`);
    if (init?.method !== "PATCH") return Response.json({ profileVersion: 0, documents, notes: savedNotes, uploadPending });
    if (failSave) return Response.json({ error: "Storage temporarily unavailable. Retry saving." }, { status: 500 });
    const body = JSON.parse(String(init.body));
    if (body.documentId) {
      const doc = documents.find((d) => d.id === body.documentId)!;
      if (doc.draft_revision !== body.revision) return Response.json({ error: "Draft changed. Reload." }, { status: 409 });
      doc.structured_data = body.data; doc.draft_revision++;
      return Response.json({ revision: doc.draft_revision });
    }
    if (body.revision !== savedNotes.revision) return Response.json({ error: "Notes changed. Reload." }, { status: 409 });
    savedNotes = { ...savedNotes, ...body.notes, revision: savedNotes.revision + 1 };
    return Response.json({ revision: savedNotes.revision });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const types = ["ncae", "nat", "form_137"] as const;
function seed(mask: number) {
  documents = types.flatMap((type, i) => {
    if (!(mask & (1 << i))) return [];
    const data = normalizeAcademicData(type, type === "form_137" ? { subjects: [{ name: "Mathematics", year: "2025", grade: 85 }] }
      : type === "ncae" ? { strand_scores: { Science: 85 }, overall_percentile: 85 } : { subjects: { Science: 85 }, composite_score: 85 });
    return [{ id: `doc-${type}`, document_type: type, structured_data: data, original_data: structuredClone(data),
      draft_revision: 1, evidence_state: "provided" as const, provenance: { documentId: `doc-${type}`, page: null } }];
  });
}
it.each(Array.from({ length: 8 }, (_, i) => i))("restores optional document combination %i without extraction or implied approval", async (mask) => {
  seed(mask); render(<InputContainer />);
  await screen.findByRole("textbox", { name: "Career Goal (required)" });
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls).toHaveLength(2);
  expect(screen.getByRole("textbox", { name: "Career Goal (required)" }).innerHTML).toBe(notes.careerGoal);
  expect(screen.queryAllByText(/Review needed/).length > 0 || mask === 0).toBeTruthy();
  expect((screen.getByRole("checkbox", { name: /I have read this notice/ }) as HTMLInputElement).checked).toBe(false);
});
it("edits/clears every academic category and notes, then restores exact saved values with provenance", async () => {
  seed(7); const view = render(<InputContainer />);
  await screen.findByRole("textbox", { name: "Career Goal (required)" });
  fireEvent.click(screen.getByRole("checkbox", { name: /I have read this notice/ }));
  for (const label of ["Overall percentile", "NAT composite", "Mathematics · Grade level unavailable · 2025"]) {
    fireEvent.change(screen.getByRole("spinbutton", { name: label }), { target: { value: "" } });
  }
  fireEvent.input(screen.getByRole("textbox", { name: "Personal Interests & Strengths (required)" }), { target: { innerHTML: "<p>Physics</p>" } });
  expect((screen.getByRole("button", { name: /Approve Inputs/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(screen.getByText(/Draft saved/)).toBeTruthy());
  expect(savedNotes.interests).toBe("<p>Physics</p>");
  for (const doc of documents) {
    expect(doc.provenance.documentId).toBe(doc.id);
    expect(doc.draft_revision).toBe(2);
  }
  view.unmount(); render(<InputContainer />); await screen.findByRole("textbox", { name: "Career Goal (required)" });
  for (const label of ["Overall percentile", "NAT composite", "Mathematics · Grade level unavailable · 2025"]) {
    expect((screen.getByRole("spinbutton", { name: label }) as HTMLInputElement).value).toBe("");
  }
  expect(screen.getByRole("textbox", { name: "Personal Interests & Strengths (required)" }).innerHTML).toBe("<p>Physics</p>");
  expect(screen.getAllByText(/Corrected/)).toHaveLength(3);
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("extract"))).toBe(false);
});
it("preserves edits on save failure and enables retry without allowing approval", async () => {
  render(<InputContainer />); await screen.findByRole("textbox", { name: "Career Goal (required)" });
  fireEvent.click(screen.getByRole("checkbox", { name: /I have read this notice/ }));
  fireEvent.input(screen.getByRole("textbox", { name: "Career Goal (required)" }), { target: { innerHTML: "<p>Engineering</p>" } });
  failSave = true; fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("textbox", { name: "Career Goal (required)" }).innerHTML).toBe("<p>Engineering</p>");
  expect((screen.getByRole("button", { name: /Approve Inputs/ }) as HTMLButtonElement).disabled).toBe(true);
  failSave = false; fireEvent.click(screen.getByRole("button", { name: "Retry saving draft" }));
  await waitFor(() => expect(screen.getByText(/Draft saved/)).toBeTruthy());
  expect(savedNotes.careerGoal).toBe("<p>Engineering</p>");
});
it("shows unsupported evidence without invented editable scores or a retained-image viewer", async () => {
  seed(2); documents[0].evidence_state = "unsupported"; documents[0].structured_data = normalizeAcademicData("nat", {});
  render(<InputContainer />); await screen.findByRole("textbox", { name: "Career Goal (required)" });
  expect(screen.getByText(/No usable scores/)).toBeTruthy();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(screen.queryByRole("img")).toBeNull();
});
it("returns to an approved session for corrections and approves the saved revisions with exact displayed notes", async () => {
  m.search = "session=saved&edit=1";
  let version = 7;
  let approved: Record<string, unknown> | undefined;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/sessions/saved") return Response.json({ sessionId: "saved", nextStep: "analysis" });
    if (url.endsWith("/approve")) {
      approved = JSON.parse(String(init?.body));
      return Response.json({ status: "approved" });
    }
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      savedNotes = { ...savedNotes, ...body.notes, revision: body.revision + 1 };
      version = 8;
      return Response.json({ revision: savedNotes.revision });
    }
    return Response.json({ profileVersion: version, documents: [], notes: savedNotes, uploadPending: false });
  }));
  render(<InputContainer />);
  await screen.findByRole("textbox", { name: "Career Goal (required)" });
  expect(m.router.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: /I have read this notice/ }));
  fireEvent.input(screen.getByRole("textbox", { name: "Career Goal (required)" }), { target: { innerHTML: "<p>Engineering</p>" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(screen.getByText(/Draft saved/)).toBeTruthy());
  fireEvent.click(screen.getByRole("checkbox", { name: /I have reviewed these notes/ }));
  fireEvent.click(screen.getByRole("button", { name: /Approve Inputs/ }));
  await waitFor(() => expect(m.router.push).toHaveBeenCalledWith("/analysis?session=saved"));
  expect(approved).toEqual({ notesReviewed: true, profileVersion: 8, notesRevision: 1, documents: [],
    counselorNotes: { ...notes, careerGoal: "<p>Engineering</p>" } });
});

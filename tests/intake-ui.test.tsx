// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InputContainer from "@/components/input/input-container";
import { normalizeAcademicData } from "@/lib/module2/extraction-contract";
import { uploadIntakeFile } from "@/lib/intake-file-upload";
import type { ExtractionDraft } from "@/types";
const m = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn() }, search: "session=saved" }));
vi.mock("next/navigation", () => ({ useRouter: () => m.router, useSearchParams: () => new URLSearchParams(m.search) }));
vi.mock("@/components/session/session-progress-indicator", () => ({ default: () => null }));
vi.mock("@/components/input/ingestion-freshness-panel", () => ({ default: () => null }));
vi.mock("@/lib/intake-file-upload", () => ({ uploadIntakeFile: vi.fn() }));
const notes = { careerGoal: "<p>Undecided</p>", interests: "<p>Mathematics</p>", financial: "", concerns: "", impression: "" };
let documents: ExtractionDraft[];
let failSave: boolean;
let uploadPending: boolean;
let savedNotes: typeof notes & { revision: number; source: null; original: null };
beforeEach(() => {
  localStorage.setItem("kumpas:processing-notice:v1", "acknowledged");
  localStorage.setItem("kumpas:workflow-orientation:v1", "seen");
  m.search = "session=saved"; vi.clearAllMocks();
  vi.mocked(uploadIntakeFile).mockResolvedValue("temporary-id");
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
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
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
});
it("edits/clears every academic category and notes, then restores exact saved values with provenance", async () => {
  seed(7); const view = render(<InputContainer />);
  await screen.findByRole("textbox", { name: "Career Goal (required)" });
  for (const [tab, label] of [["NCAE", "Overall percentile"], ["NAT", "NAT composite"], ["Form 137", "Mathematics · Grade level unavailable · 2025"]]) {
    await userEvent.click(screen.getByRole("tab", { name: tab }));
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
  for (const [tab, label] of [["NCAE", "Overall percentile"], ["NAT", "NAT composite"], ["Form 137", "Mathematics · Grade level unavailable · 2025"]]) {
    await userEvent.click(screen.getByRole("tab", { name: tab }));
    expect((screen.getByRole("spinbutton", { name: label }) as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Corrected")).toBeTruthy();
  }
  expect(screen.getByRole("textbox", { name: "Personal Interests & Strengths (required)" }).innerHTML).toBe("<p>Physics</p>");
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("extract"))).toBe(false);
});
it("preserves edits on save failure and enables retry without allowing approval", async () => {
  render(<InputContainer />); await screen.findByRole("textbox", { name: "Career Goal (required)" });
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
  expect(screen.getByText(/No usable scores were extracted/)).toBeTruthy();
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
  fireEvent.input(screen.getByRole("textbox", { name: "Career Goal (required)" }), { target: { innerHTML: "<p>Engineering</p>" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(screen.getByText(/Draft saved/)).toBeTruthy());
  fireEvent.click(screen.getByRole("checkbox", { name: /I have reviewed these notes/ }));
  fireEvent.click(screen.getByRole("button", { name: /Approve Inputs/ }));
  await waitFor(() => expect(m.router.push).toHaveBeenCalledWith("/analysis?session=saved"));
  expect(approved).toEqual({ notesReviewed: true, profileVersion: 8, notesRevision: 1, documents: [],
    counselorNotes: { ...notes, careerGoal: "<p>Engineering</p>" } });
});

it.each([false, true])("removes a notes photograph and extracts the same file again after an initial failure: %s", async (initialFailure) => {
  savedNotes = { careerGoal: "", interests: "", financial: "", concerns: "", impression: "", revision: 0, source: null, original: null };
  const draftFetch = vi.mocked(fetch).getMockImplementation()!;
  const revisions: number[] = [];
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (url !== "/api/extract-notes") return draftFetch(url, init);
    const body = JSON.parse(String(init?.body));
    revisions.push(body.revision);
    if (initialFailure && revisions.length === 1) return Response.json({ error: "Gemini API request failed" }, { status: 502 });
    expect(body.revision).toBe(savedNotes.revision);
    savedNotes = { ...savedNotes, ...notes, revision: savedNotes.revision + 1 };
    return Response.json({ ...notes, revision: savedNotes.revision, source: { documentId: "notes-source", page: 1 } });
  });
  const { container } = render(<InputContainer />);
  await screen.findByRole("textbox", { name: "Career Goal (required)" });
  await userEvent.click(screen.getByRole("tab", { name: "Image Analysis" }));
  const file = new File(["synthetic notes"], "notes.png", { type: "image/png" });
  fireEvent.change(container.querySelector("#notes-file-input")!, { target: { files: [file] } });
  await screen.findByText("Notes photograph released");
  fireEvent.click(screen.getByRole("button", { name: "Remove notes photograph" }));
  expect(screen.queryByRole("button", { name: "Remove notes photograph" })).toBeNull();
  expect(screen.queryByText(/Notes source:/)).toBeNull();
  fireEvent.change(container.querySelector("#notes-file-input")!, { target: { files: [file] } });
  await waitFor(() => expect(uploadIntakeFile).toHaveBeenCalledTimes(2));
  await screen.findByText("Extracted & ready to edit · Photograph released");
  expect(revisions).toEqual(initialFailure ? [0, 0] : [0, 1]);
  expect((screen.getByRole("button", { name: /Approve Inputs/ }) as HTMLButtonElement).disabled).toBe(true);
});

it("removes an extracted document without saving first and permits uploading it again", async () => {
  const draftFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (!String(url).startsWith("/api/sessions/saved/upload")) return draftFetch(url, init);
    if (init?.method === "DELETE") {
      expect(String(url)).toContain("docType=ncae&documentId=doc-ncae");
      documents = [];
      return Response.json({ status: "removed" });
    }
    seed(1);
    const doc = documents[0];
    return Response.json({ documentId: doc.id, structuredData: doc.structured_data, originalData: doc.original_data,
      revision: doc.draft_revision, evidenceState: doc.evidence_state, provenance: doc.provenance });
  });
  const { container } = render(<InputContainer />);
  await screen.findByRole("textbox", { name: "Career Goal (required)" });
  const input = container.querySelector('section[aria-label="Supporting documents"] input')!;
  const file = new File(["synthetic academic record"], "ncae.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByRole("spinbutton", { name: "Overall percentile" });
  const remove = screen.getByRole("button", { name: "Remove document 1" });
  expect(remove.matches(":disabled")).toBe(false);
  fireEvent.click(remove);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Remove document 1" })).toBeNull());
  expect(screen.queryByRole("spinbutton", { name: "Overall percentile" })).toBeNull();
  expect(documents).toHaveLength(0);
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(uploadIntakeFile).toHaveBeenCalledTimes(2));
  await screen.findByRole("spinbutton", { name: "Overall percentile" });
  expect((screen.getByRole("button", { name: /Approve Inputs/ }) as HTMLButtonElement).disabled).toBe(true);
});

it.each([true, false])("runs notes, document removal and separate uploads independently (notes first: %s)", async (notesFirst) => {
  seed(1);
  savedNotes = { careerGoal: "", interests: "", financial: "", concerns: "", impression: "", revision: 0, source: null, original: null };
  const draftFetch = vi.mocked(fetch).getMockImplementation()!;
  let finishNotes!: (response: Response) => void;
  let finishRemoval!: (response: Response) => void;
  let finishNat!: (response: Response) => void;
  let finishForm!: (response: Response) => void;
  const notesResponse = new Promise<Response>(resolve => { finishNotes = resolve; });
  const removalResponse = new Promise<Response>(resolve => { finishRemoval = resolve; });
  const natResponse = new Promise<Response>(resolve => { finishNat = resolve; });
  const formResponse = new Promise<Response>(resolve => { finishForm = resolve; });
  vi.mocked(uploadIntakeFile).mockImplementation(async (_session, _file, details) => details.docType);
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (url === "/api/extract-notes") return notesResponse;
    if (String(url).startsWith("/api/sessions/saved/upload")) {
      if (init?.method === "DELETE") return removalResponse;
      return JSON.parse(String(init?.body)).uploadId === "nat" ? natResponse : formResponse;
    }
    return draftFetch(url, init);
  });
  const { container } = render(<InputContainer />);
  await screen.findByRole("textbox", { name: "Career Goal (required)" });
  await userEvent.click(screen.getByRole("tab", { name: "Image Analysis" }));
  const photo = new File(["synthetic"], "notes.png", { type: "image/png" });
  if (notesFirst) fireEvent.change(container.querySelector("#notes-file-input")!, { target: { files: [photo] } });
  const remove = screen.getByRole("button", { name: "Remove document 1" });
  expect(remove.matches(":disabled")).toBe(false);
  fireEvent.click(remove);
  await screen.findByText("Removing document…");
  expect(remove.matches(":disabled")).toBe(true);
  expect(screen.queryByText("AI structuring…")).toBeNull();
  if (!notesFirst) fireEvent.change(container.querySelector("#notes-file-input")!, { target: { files: [photo] } });
  await screen.findByText("Reading handwriting with AI Vision…");
  const inputs = container.querySelectorAll('section[aria-label="Supporting documents"] input');
  for (const index of [1, 2]) {
    const button = screen.getByRole("button", { name: `Upload document ${index + 1}` });
    expect(button.matches(":disabled")).toBe(false);
    fireEvent.change(inputs[index], { target: { files: [photo] } });
  }
  await waitFor(() => expect(uploadIntakeFile).toHaveBeenCalledTimes(3));
  await act(async () => finishForm(Response.json({ documentId: "doc-form", structuredData: normalizeAcademicData("form_137", { subjects: [] }), revision: 1, evidenceState: "provided" })));
  expect(screen.getByRole("button", { name: "Remove document 3" }).matches(":disabled")).toBe(false);
  await act(async () => finishRemoval(Response.json({ status: "removed" })));
  expect(screen.queryByRole("button", { name: "Remove document 1" })).toBeNull();
  expect(screen.getByText("Reading handwriting with AI Vision…")).toBeTruthy();
  await act(async () => finishNotes(Response.json({ ...notes, revision: 1, source: { documentId: "notes-source", page: 1 } })));
  expect(screen.getByRole("textbox", { name: "Career Goal (required)" }).innerHTML).toBe(notes.careerGoal);
  expect(screen.getByRole("button", { name: "Save draft" }).matches(":disabled")).toBe(true);
  await act(async () => finishNat(Response.json({ documentId: "doc-nat", structuredData: normalizeAcademicData("nat", { subjects: { Science: 91 }, composite_score: 91 }), revision: 1, evidenceState: "provided" })));
  await userEvent.click(screen.getByRole("tab", { name: "NAT" }));
  expect(screen.getByRole("spinbutton", { name: "NAT composite" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove document 3" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save draft" }).matches(":disabled")).toBe(false);
  expect(screen.getByRole("button", { name: /Approve Inputs/ }).matches(":disabled")).toBe(true);
});

// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FileSlot from "@/components/input/file-slot";
import DocumentUploadPanel from "@/components/input/document-upload-panel";
import ConfirmationApprovalBar from "@/components/input/confirmation-approval-bar";
import { MAX_ACADEMIC_FILE_BYTES } from "@/lib/academic-upload-policy";
import type { UploadedDocument } from "@/types";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("offers single-file replacement for every type and reports invalid selections before upload", () => {
  const add = vi.fn();
  for (const docType of ["form_137", "ncae", "nat"]) {
    const { container, unmount } = render(<FileSlot index={1} docType={docType} files={[]} perFileProcessing={[]} onFilesAdd={add} onFileRemove={vi.fn()} onTypeChange={vi.fn()} />);
    const input = container.querySelector("input")!;
    expect(input.multiple).toBe(false); expect(input.accept).toBe(".jpg,.jpeg,.png,.webp,.pdf");
    const tooLarge = new File([new Uint8Array(MAX_ACADEMIC_FILE_BYTES + 1)], "record.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [tooLarge] } });
    expect(screen.getByRole("alert").textContent).toContain("10,000,000 bytes"); expect(add).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [new File(["a"], "a.pdf"), new File(["b"], "b.pdf")] } });
    expect(screen.getByRole("alert").textContent).toContain("one file"); expect(add).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(MAX_ACADEMIC_FILE_BYTES)], "record.pdf", { type: "application/pdf" })] } });
    expect(add).toHaveBeenCalledOnce(); add.mockClear(); unmount();
  }
});
it("labels an occupied slot Replace, prevents type changes, and blocks edits while processing", () => {
  const file = new File([new Uint8Array(MAX_ACADEMIC_FILE_BYTES)], "record.pdf");
  const props = { index: 1, docType: "form_137", files: [file], onFilesAdd: vi.fn(), onFileRemove: vi.fn(), onTypeChange: vi.fn() };
  const { rerender } = render(<FileSlot {...props} perFileProcessing={[{ step: "complete", progress: 100 }]} />);
  expect(screen.getByRole("button", { name: "Replace" })).toBeDefined();
  expect(screen.getByText("10.0 MB")).toBeDefined();
  expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
  rerender(<FileSlot {...props} perFileProcessing={[{ step: "ai_structuring", progress: 30 }]} />);
  expect((screen.getByRole("button", { name: "Replace" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Remove file" }) as HTMLButtonElement).disabled).toBe(true);
});
it("sends explicit replacement and removal IDs, preserving local selection until removal succeeds", async () => {
  const file = new File(["a"], "record.pdf", { type: "application/pdf" });
  const previous: UploadedDocument = { documentId: "old-id", slotIndex: 1, docType: "nat", extractedData: { type: "nat", data: { subjects: {} } }, originalExtractedData: { type: "nat", data: { subjects: {} } }, redactedImageUrl: null };
  const empty = { docType: "", files: [], perFileProcessing: [], uploaded: null };
  const remove = vi.fn(), uploaded = vi.fn(), failed = vi.fn();
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ documentId: "new-id", structuredData: { type: "nat", data: {} }, redactedImageUrl: null }) });
  vi.stubGlobal("fetch", fetchMock);
  const { container } = render(<DocumentUploadPanel sessionId="session" slots={{ 1: { docType: "nat", files: [file], perFileProcessing: [{ step: "complete", progress: 100 }], uploaded: previous }, 2: empty, 3: empty }} onSlotFilesAdd={vi.fn()} onSlotFileRemove={remove} onSlotTypeChange={vi.fn()} onDocumentUploaded={uploaded} onUploadError={failed} />);
  fireEvent.change(container.querySelector("input")!, { target: { files: [file] } });
  await waitFor(() => expect(uploaded).toHaveBeenCalledOnce());
  expect((fetchMock.mock.calls[0][1].body as FormData).get("replaceDocumentId")).toBe("old-id");
  fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Try removal again" }) });
  fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
  await waitFor(() => expect(failed).toHaveBeenCalledOnce()); expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith(1, 0));
  expect(fetchMock.mock.calls[2][0]).toContain("docType=nat&documentId=old-id");
});
it("keeps zero academic files optional and blocks approval of pending or failed selected documents", () => {
  const notes = { careerGoal: "Undecided", interests: "Math", financial: "Reviewed", concerns: "Reviewed", impression: "Reviewed" };
  const { rerender } = render(<ConfirmationApprovalBar sessionId="session" notes={notes} documentsReady={true} isSubmitting={false} onApprove={vi.fn()} />);
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  rerender(<ConfirmationApprovalBar sessionId="session" notes={notes} documentsReady={false} isSubmitting={false} onApprove={vi.fn()} />);
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
});

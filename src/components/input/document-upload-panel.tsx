"use client";

import { FolderOpen, Info } from "lucide-react";
import { useRef } from "react";
import { academicFileSizeError } from "@/lib/academic-upload-policy";
import { uploadIntakeFile } from "@/lib/intake-file-upload";
import FileSlot from "./file-slot";
import type { DocumentProcessingState, UploadedDocument } from "@/types";

interface SlotState {
  files: File[];
  docType: string;
  perFileProcessing: DocumentProcessingState[];
  uploaded: UploadedDocument | null;
}

interface DocumentUploadPanelProps {
  sessionId: string;
  disabled?: boolean;
  slots: { 1: SlotState; 2: SlotState; 3: SlotState };
  onSlotFilesAdd: (index: 1 | 2 | 3, files: File[]) => void;
  onSlotFileRemove: (index: 1 | 2 | 3, fileIndex: number) => void;
  onSlotTypeChange: (index: 1 | 2 | 3, type: string) => void;
  onDocumentUploaded: (index: 1 | 2 | 3, file: File, result: UploadedDocument) => void;
  onUploadError: (index: 1 | 2 | 3, file: File, error: string) => void;
}

export default function DocumentUploadPanel({
  sessionId,
  disabled = false,
  slots,
  onSlotFilesAdd,
  onSlotFileRemove,
  onSlotTypeChange,
  onDocumentUploaded,
  onUploadError,
}: DocumentUploadPanelProps) {
  const pending = useRef(new Set<number>());
  const uploadOne = async (index: 1 | 2 | 3, file: File, docType: string, previous: UploadedDocument | null) => {
    try {
      const uploadId = await uploadIntakeFile(sessionId, file, { docType, replaceDocumentId: previous?.documentId });
      const res = await fetch(`/api/sessions/${sessionId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || (res.status === 413
          ? "File exceeds 10 MB (10,000,000 bytes). Choose a smaller file." : "Upload failed. Retry or replace the file."));
      }
      const data = await res.json();
      if (data.cleanupPending) onUploadError(index, file, "Extraction saved. Temporary artifact cleanup is pending retry.");
      onDocumentUploaded(index, file, {
        documentId: data.documentId,
        slotIndex: index,
        docType,
        extractedData: data.structuredData,
        redactedImageUrl: null,
        originalExtractedData: data.originalData ?? structuredClone(data.structuredData),
        revision: data.revision, evidenceState: data.evidenceState, provenance: data.provenance,
      });
    } catch (err) {
      onUploadError(index, file, err instanceof Error ? err.message : "Upload failed");
    } finally {
      pending.current.delete(index);
    }
  };

  const handleFilesAdd = (index: 1 | 2 | 3, files: File[]) => {
    const docType = slots[index].docType;
    if (!docType || files.length !== 1 || pending.current.has(index)) return;
    const file = files[0];
    const error = academicFileSizeError(file);
    if (error) { onUploadError(index, file, error); return; }
    pending.current.add(index);
    onSlotFilesAdd(index, files);
    void uploadOne(index, file, docType, slots[index].uploaded);
  };

  const handleRemove = async (index: 1 | 2 | 3, fileIndex: number) => {
    if (pending.current.has(index)) return;
    const previous = slots[index].uploaded;
    if (!previous) { onSlotFileRemove(index, fileIndex); return; }
    pending.current.add(index);
    onSlotFilesAdd(index, [slots[index].files[fileIndex]]);
    try {
      const query = new URLSearchParams({ docType: previous.docType, documentId: previous.documentId });
      const response = await fetch(`/api/sessions/${sessionId}/upload?${query}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not remove the document. Retry removal.");
      }
      onSlotFileRemove(index, fileIndex);
    } catch (error) {
      onUploadError(index, slots[index].files[fileIndex], error instanceof Error ? error.message : "Could not remove the document.");
    } finally {
      pending.current.delete(index);
    }
  };

  // Each academic type has at most one file; changing it requires Replace or Remove.
  const getExcluded = (index: 1 | 2 | 3) =>
    ([1, 2, 3] as const)
      .filter((i) => i !== index)
      .map((i) => slots[i].docType)
      .filter(Boolean);

  return (
    <fieldset disabled={disabled} className="min-w-0 p-5 sm:p-8">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ochre-pale text-ochre">
          <FolderOpen size={20} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-ink leading-snug flex flex-wrap items-center gap-2">
            Supporting Documents
            <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] whitespace-nowrap font-bold uppercase tracking-wider text-muted-text">
              Optional — Max 3 types
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-text leading-relaxed">
            Upload optional student records for extraction with the approved Gemini service.
            Review and correct the results before analysis.
          </p>
        </div>
      </div>
      <div className="flex items-start sm:items-center gap-2.5 rounded-lg bg-ochre-pale/60 border border-ochre/10 px-3 py-2.5 mb-4 text-xs text-ochre leading-snug">
        <Info size={14} className="shrink-0 mt-0.5 sm:mt-0" />
        <span>
          Optional: one NCAE, Form 137 and NAT file each. JPEG, PNG, WEBP or PDF,
          up to 10 MB (10,000,000 bytes) per file. Use Replace to change a file.
        </span>
      </div>
      <div className="space-y-3">
        {([1, 2, 3] as const).map((i) => (
          <FileSlot
            key={i}
            index={i}
            files={slots[i].files}
            perFileProcessing={slots[i].perFileProcessing}
            docType={slots[i].docType}
            excludeTypes={getExcluded(i)}
            onFilesAdd={(f) => handleFilesAdd(i, f)}
            onFileRemove={(fileIdx) => { void handleRemove(i, fileIdx); }}
            onTypeChange={(t) => onSlotTypeChange(i, t)}
          />
        ))}
      </div>
    </fieldset>
  );
}

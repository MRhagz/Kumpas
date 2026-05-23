"use client";

import { FolderOpen, Info } from "lucide-react";
import FileSlot from "./file-slot";
import type { DocumentProcessingState, UploadedDocument } from "@/types";

interface SlotState {
  file: File | null;
  docType: string;
  processingState: DocumentProcessingState;
}

interface DocumentUploadPanelProps {
  sessionId: string;
  slots: { 1: SlotState; 2: SlotState; 3: SlotState };
  onSlotFileChange: (index: 1 | 2 | 3, file: File | null) => void;
  onSlotTypeChange: (index: 1 | 2 | 3, type: string) => void;
  onDocumentUploaded: (index: 1 | 2 | 3, result: UploadedDocument) => void;
  onUploadError: (index: 1 | 2 | 3, error: string) => void;
}

export default function DocumentUploadPanel({
  sessionId,
  slots,
  onSlotFileChange,
  onSlotTypeChange,
  onDocumentUploaded,
  onUploadError,
}: DocumentUploadPanelProps) {
  const upload = async (index: 1 | 2 | 3, file: File, docType: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("docType", docType);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/upload`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Upload failed");
      }
      const data = await res.json();
      onDocumentUploaded(index, {
        documentId: data.documentId,
        slotIndex: index,
        docType,
        extractedData: data.structuredData,
        redactedImageUrl: data.redactedImageUrl,
        originalExtractedData: structuredClone(data.structuredData),
      });
    } catch (err) {
      onUploadError(index, err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleFileChange = async (index: 1 | 2 | 3, file: File | null) => {
    onSlotFileChange(index, file);
    if (!file) return;
    const docType = slots[index].docType;
    if (docType) await upload(index, file, docType);
  };

  const handleTypeChange = async (index: 1 | 2 | 3, type: string) => {
    onSlotTypeChange(index, type);
    const file = slots[index].file;
    if (file && type) await upload(index, file, type);
  };

  const getExcluded = (index: 1 | 2 | 3) =>
    ([1, 2, 3] as const)
      .filter((i) => i !== index)
      .map((i) => slots[i].docType)
      .filter(Boolean);

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ochre-pale text-ochre">
          <FolderOpen size={20} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-ink leading-snug flex flex-wrap items-center gap-2">
            Supporting Documents
            <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] whitespace-nowrap font-bold uppercase tracking-wider text-muted-text">
              Optional — Max 3
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-text leading-relaxed">
            Upload student records to improve AI accuracy. PII is automatically redacted server-side
            before analysis.
          </p>
        </div>
      </div>
      <div className="flex items-start sm:items-center gap-2.5 rounded-lg bg-ochre-pale/60 border border-ochre/10 px-3 py-2.5 mb-4 text-xs text-ochre leading-snug">
        <Info size={14} className="shrink-0 mt-0.5 sm:mt-0" />
        <span>Accepted: NCAE Results, Form 137, or NAT Results — as PDF or photo (max 10 MB)</span>
      </div>
      <div className="space-y-3">
        {([1, 2, 3] as const).map((i) => (
          <FileSlot
            key={i}
            index={i}
            file={slots[i].file}
            docType={slots[i].docType}
            excludeTypes={getExcluded(i)}
            onFileChange={(f) => handleFileChange(i, f)}
            onTypeChange={(t) => handleTypeChange(i, t)}
            processingState={slots[i].processingState}
          />
        ))}
      </div>
    </div>
  );
}

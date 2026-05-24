"use client";

import { Check, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import type { DocumentProcessingState } from "@/types";

const STEP_LABELS: Record<string, string> = {
  idle: "",
  ocr_scanning: "Scanning…",
  pii_detecting: "Detecting PII…",
  pii_redacting: "Redacting personal info…",
  structuring: "Structuring data…",
  ai_structuring: "AI extracting…",
  complete: "Extraction complete",
  error: "Extraction failed",
};

interface UploadStatusIndicatorProps {
  processingState: DocumentProcessingState;
  piiCount?: number;
}

export default function UploadStatusIndicator({
  processingState,
  piiCount,
}: UploadStatusIndicatorProps) {
  const { step, progress, error } = processingState;
  if (step === "idle") return null;

  const isProcessing = !["idle", "complete", "error"].includes(step);
  const isComplete = step === "complete";
  const isError = step === "error";

  return (
    <div
      className={`border-t px-3 py-2.5 text-[12px] ${
        isError
          ? "border-red-soft/20 bg-red-light text-red-soft"
          : isComplete
            ? "border-sage/20 bg-sage/[0.04] text-sage"
            : "border-black/[0.06] bg-black/[0.01] text-charcoal-3"
      }`}
    >
      <div className="flex items-center gap-2">
        {isProcessing && <Loader2 size={13} className="animate-spin shrink-0" />}
        {isComplete && <ShieldCheck size={13} className="shrink-0" />}
        {isError && <AlertTriangle size={13} className="shrink-0" />}
        <span className="font-medium">{STEP_LABELS[step]}</span>
        {isComplete && (piiCount ?? 0) > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[11px]">
            <Check size={11} /> {piiCount} PII redacted server-side
          </span>
        )}
        {isError && error && <span className="ml-1 font-normal opacity-80">— {error}</span>}
      </div>
      {isProcessing && (
        <div className="mt-1.5 h-1 w-full rounded-full bg-black/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-sage transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

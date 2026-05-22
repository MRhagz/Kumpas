/**
 * Document processing pipeline orchestrator.
 *
 * Runs the full intake pipeline for a single document:
 * 1. OCR scan (Tesseract.js)
 * 2. PII detection + redaction
 * 3. Local structuring attempt
 * 4. AI fallback via /api/extract-document
 *
 * NOTE: The core processing logic is inlined in input-container.tsx
 * for direct state integration. This module is preserved for potential
 * reuse as a standalone hook in other contexts.
 */

"use client";

import { useCallback, useRef } from "react";
import type {
  DocumentProcessingState,
  ExtractedAcademicData,
} from "@/types";

interface UseDocumentProcessorOptions {
  onStateChange: (state: DocumentProcessingState) => void;
}

export function useDocumentProcessor({ onStateChange }: UseDocumentProcessorOptions) {
  const abortRef = useRef(false);

  const processDocument = useCallback(
    async (file: File, docType: string): Promise<ExtractedAcademicData | null> => {
      abortRef.current = false;

      try {
        const { ocrFromFile } = await import("@/lib/ocr-service");
        const { detectPII, mapPIIToBboxes, redactText, redactImage } = await import("@/lib/pii-redactor");
        const { tryStructureLocally } = await import("@/lib/document-structurer");

        /* ── Step 1: OCR ── */
        onStateChange({ step: "ocr_scanning", progress: 0 });

        const ocrResult = await ocrFromFile(file, (progress) => {
          if (abortRef.current) return;
          onStateChange({ step: "ocr_scanning", progress: Math.min(progress, 95) });
        });

        if (abortRef.current) return null;

        /* ── Step 2: PII Detection ── */
        onStateChange({ step: "pii_detecting", progress: 0, ocrResult });

        const piiMatches = detectPII(ocrResult.text);
        const piiWithBboxes = mapPIIToBboxes(piiMatches, ocrResult.words);

        if (abortRef.current) return null;

        /* ── Step 3: PII Redaction ── */
        onStateChange({ step: "pii_redacting", progress: 30, ocrResult, piiMatches: piiWithBboxes });

        const redactedTxt = redactText(ocrResult.text, piiWithBboxes);
        let redactedImgUrl: string | undefined;
        if (file.type.startsWith("image/")) {
          redactedImgUrl = await redactImage(file, piiWithBboxes);
        }

        if (abortRef.current) return null;

        /* ── Step 4: Local Structuring ── */
        onStateChange({ step: "structuring", progress: 60, ocrResult, piiMatches: piiWithBboxes, redactedText: redactedTxt, redactedImageUrl: redactedImgUrl });

        let extracted = tryStructureLocally(redactedTxt, docType);

        /* ── Step 5: AI Fallback ── */
        if (!extracted) {
          if (abortRef.current) return null;
          onStateChange({ step: "ai_structuring", progress: 75, ocrResult, piiMatches: piiWithBboxes, redactedText: redactedTxt, redactedImageUrl: redactedImgUrl });

          try {
            const res = await fetch("/api/extract-document", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ocrText: redactedTxt, docType }),
            });
            if (res.ok) {
              extracted = await res.json() as ExtractedAcademicData;
            }
          } catch (err) {
            console.warn("[document-processor] AI extraction failed:", err);
          }
        }

        if (abortRef.current) return null;

        /* ── Done ── */
        onStateChange({
          step: extracted ? "complete" : "error",
          progress: 100,
          ocrResult,
          piiMatches: piiWithBboxes,
          redactedText: redactedTxt,
          redactedImageUrl: redactedImgUrl,
          extractedData: extracted ?? undefined,
          error: extracted ? undefined : "Could not extract structured data.",
        });

        return extracted;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown processing error";
        onStateChange({ step: "error", progress: 0, error: message });
        return null;
      }
    },
    [onStateChange]
  );

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return { processDocument, abort };
}

/**
 * Tesseract.js OCR wrapper for client-side text extraction.
 *
 * Supports image files directly and PDF files via pdfjs-dist canvas rendering.
 */

import Tesseract from "tesseract.js";
import type { OCRResult, OCRWordBox } from "@/types";

export type OCRProgressCallback = (progress: number, status: string) => void;

/**
 * Run OCR on an image file (JPEG, PNG, WEBP, etc.)
 */
export async function ocrFromImage(
  file: File,
  onProgress?: OCRProgressCallback
): Promise<OCRResult> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const result = await Tesseract.recognize(imageUrl, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          onProgress?.(Math.round(m.progress * 100), "Recognizing text…");
        } else if (m.status) {
          onProgress?.(0, m.status);
        }
      },
    });

    const words: OCRWordBox[] = [];
    for (const block of result.data.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const word of line.words ?? []) {
            words.push({
              text: word.text,
              confidence: word.confidence,
              bbox: {
                x0: word.bbox.x0,
                y0: word.bbox.y0,
                x1: word.bbox.x1,
                y1: word.bbox.y1,
              },
            });
          }
        }
      }
    }

    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

/**
 * Run OCR on a PDF file by rendering pages to canvas via pdfjs-dist.
 * Returns merged results for all pages.
 */
export async function ocrFromPDF(
  file: File,
  onProgress?: OCRProgressCallback
): Promise<OCRResult> {
  // Dynamic import to avoid SSR issues — pdfjs-dist is browser-only
  const pdfjsLib = await import("pdfjs-dist");

  // Set the worker source
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const totalPages = pdf.numPages;
  const allResults: OCRResult[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(
      Math.round(((pageNum - 1) / totalPages) * 100),
      `Rendering page ${pageNum}/${totalPages}…`
    );

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for better OCR

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    // Convert canvas to blob and OCR it
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png")
    );

    const pageFile = new File([blob], `page-${pageNum}.png`, {
      type: "image/png",
    });

    const pageResult = await ocrFromImage(pageFile, (pct, status) => {
      const base = ((pageNum - 1) / totalPages) * 100;
      const pageShare = 100 / totalPages;
      onProgress?.(
        Math.round(base + (pct / 100) * pageShare),
        `Page ${pageNum}: ${status}`
      );
    });

    allResults.push({ ...pageResult, page: pageNum });
  }

  // Merge all page results
  return {
    text: allResults.map((r) => r.text).join("\n\n--- Page Break ---\n\n"),
    confidence:
      allResults.reduce((sum, r) => sum + r.confidence, 0) / allResults.length,
    words: allResults.flatMap((r) => r.words),
  };
}

/**
 * Auto-detect file type and run the appropriate OCR.
 */
export async function ocrFromFile(
  file: File,
  onProgress?: OCRProgressCallback
): Promise<OCRResult> {
  if (file.type === "application/pdf") {
    return ocrFromPDF(file, onProgress);
  }
  return ocrFromImage(file, onProgress);
}

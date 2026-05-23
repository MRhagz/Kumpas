import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { piiRedactionService } from "@/lib/module2/pii-redaction-service";
import { documentStorageService } from "@/lib/module2/document-storage-service";
import { geminiExtractionService } from "@/lib/module2/gemini-extraction-service";
import { sessionInitializationService } from "@/lib/module2/session-initialization-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const docType = formData.get("docType") as string | null;

    if (!file || !docType) {
      return Response.json({ error: "Missing required fields: file, docType" }, { status: 400 });
    }
    if (!["ncae", "form_137", "nat"].includes(docType)) {
      return Response.json({ error: `Invalid docType: ${docType}` }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return Response.json({ error: "File exceeds 10MB limit" }, { status: 413 });
    }

    // Raw buffer stays in memory — never written to disk (deviation #3, plan §Stated Deviations)
    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "image/jpeg";

    // PIIRedactionService: Gemini Vision two-pass — see deviation #6 for SRS justification
    const { redactedBuffer, piiCount } = await piiRedactionService.redact(rawBuffer, mimeType);

    // DocumentStorageService: persist redacted image to kumpas-documents bucket
    const docId = randomUUID();
    const redactedPath = await documentStorageService.storeRedacted(redactedBuffer, sessionId, docId);

    // GeminiExtractionService: structured extraction from the redacted image
    const extractionResult = await geminiExtractionService.extract(
      redactedBuffer,
      docType,
      sessionId,
      redactedPath,
    );

    const redactedImageUrl = await documentStorageService.retrieveRedacted(redactedPath);
    await sessionInitializationService.updateLastActivity(sessionId);

    return Response.json({
      documentId: docId,
      extractionResultId: extractionResult.id,
      docType,
      structuredData: extractionResult.structured_data,
      redactedImageUrl,
      piiCount,
      status: "complete",
    });
  } catch (err) {
    console.error(`[upload route] sessionId=${sessionId}`, err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload processing failed" },
      { status: 500 },
    );
  }
}

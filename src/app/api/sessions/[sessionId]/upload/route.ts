import { type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { piiRedactionService } from "@/lib/module2/pii-redaction-service";
import { documentStorageService } from "@/lib/module2/document-storage-service";
import { geminiExtractionService } from "@/lib/module2/gemini-extraction-service";
import { sessionInitializationService } from "@/lib/module2/session-initialization-service";
import { sessionProgressTracker } from "@/lib/module5/session-progress";
import { readAcademicUpload, uploadErrorResponse } from "@/lib/module2/academic-upload-validation";
import { academicDocumentStore, type AcademicUploadClaim } from "@/lib/module2/academic-document-store";
import { ACADEMIC_DOCUMENT_TYPES } from "@/lib/academic-upload-policy";
import { renderAcademicPdf } from "@/lib/module2/academic-pdf-renderer";
import {
  notFoundResponse,
  requireUser,
  unauthorizedResponse,
  userOwnsSession,
} from "@/lib/auth/api-auth";

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();

  let claim: AcademicUploadClaim | undefined;
  let redactedPath: string | undefined;
  let committed = false;
  try {
    const { buffer: rawBuffer, mimeType, docType, replaceDocumentId } = await readAcademicUpload(request);
    claim = await academicDocumentStore.claim(sessionId, user.id, docType, replaceDocumentId);

    // Raw buffer stays in memory — never written to disk (deviation #3, plan §Stated Deviations)
    await sessionProgressTracker.markIntakeInProgress(sessionId);

    // PIIRedactionService: Gemini Vision two-pass — see deviation #6 for SRS justification
    const imageBuffer = mimeType === "application/pdf" ? await renderAcademicPdf(rawBuffer) : rawBuffer;
    const { redactedBuffer, piiCount } = await piiRedactionService.redact(imageBuffer, mimeType === "application/pdf" ? "image/jpeg" : mimeType);

    // DocumentStorageService: persist redacted image to kumpas-documents bucket
    const docId = randomUUID();
    redactedPath = await documentStorageService.storeRedacted(redactedBuffer, sessionId, docId);
    const redactedImageUrl = await documentStorageService.retrieveRedacted(redactedPath);
    await sessionInitializationService.updateLastActivity(sessionId);

    // GeminiExtractionService: structured extraction from the redacted image
    const extractionResult = await geminiExtractionService.extract(
      redactedBuffer,
      docType,
      sessionId,
      user.id,
      redactedPath,
      claim,
    );
    committed = true;
    if (claim.previousPath) {
      await documentStorageService.deleteRedacted(claim.previousPath).catch(() => {
        console.error("[upload route] Could not delete replaced redacted image");
      });
    }

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
    const validation = uploadErrorResponse(err);
    if (validation) return validation;
    console.error(`[upload route] sessionId=${sessionId}`, err);
    return Response.json(
      { error: "Upload processing failed. Retry or replace the file; the previous document has been preserved." },
      { status: 500 },
    );
  } finally {
    if (claim && !committed) {
      if (redactedPath) await documentStorageService.deleteRedacted(redactedPath).catch(() => {
        console.error("[upload route] Could not delete failed redacted image");
      });
      await academicDocumentStore.release(claim).catch(() => {
        console.error("[upload route] Could not release upload reservation");
      });
    }
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();
  const docType = request.nextUrl.searchParams.get("docType") ?? "";
  const documentId = request.nextUrl.searchParams.get("documentId") ?? "";
  if (!ACADEMIC_DOCUMENT_TYPES.includes(docType) || !/^[0-9a-f-]{36}$/i.test(documentId)) {
    return Response.json({ error: "Choose the current document to remove." }, { status: 400 });
  }
  let claim: AcademicUploadClaim | undefined;
  try {
    claim = await academicDocumentStore.claim(sessionId, user.id, docType, documentId);
    await academicDocumentStore.remove(claim);
    if (claim.previousPath) await documentStorageService.deleteRedacted(claim.previousPath).catch(() => {
      console.error("[upload route] Could not delete removed redacted image");
    });
    return Response.json({ status: "removed" });
  } catch (error) {
    return uploadErrorResponse(error) ?? Response.json({ error: "Could not remove the document. Retry removal." }, { status: 500 });
  } finally {
    if (claim) await academicDocumentStore.release(claim).catch(() => {});
  }
}

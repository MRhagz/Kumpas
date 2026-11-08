import { type NextRequest } from "next/server";
import { geminiExtractionService } from "@/lib/module2/gemini-extraction-service";
import { readAcademicUpload, uploadErrorResponse, UploadValidationError } from "@/lib/module2/academic-upload-validation";
import { claimTemporaryUpload, downloadTemporaryUpload, cleanupTemporaryUpload, readUploadJson, type TemporaryIntakeUpload } from "@/lib/module2/temporary-intake-upload";
import { academicDocumentStore, type AcademicUploadClaim } from "@/lib/module2/academic-document-store";
import { drainExtractionCleanup } from "@/lib/module2/extraction-cleanup";
import { draftHeaders } from "@/lib/module2/intake-draft-store";
import { ACADEMIC_DOCUMENT_TYPES } from "@/lib/academic-upload-policy";
import { renderAcademicPdf } from "@/lib/module2/academic-pdf-renderer";
import { notFoundResponse, requireUser, unauthorizedResponse, userOwnsSession } from "@/lib/auth/api-auth";

export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();
  let claim: AcademicUploadClaim | undefined;
  let temporary: TemporaryIntakeUpload | undefined;
  let committed = false;
  try {
    let buffer: Buffer, mimeType: string, docType: string;
    if (request.headers.get("content-type")?.startsWith("application/json")) {
      const body = await readUploadJson(request);
      temporary = await claimTemporaryUpload(sessionId, user.id, body.uploadId);
      if (!ACADEMIC_DOCUMENT_TYPES.includes(temporary.document_type) || !temporary.extraction_id || !temporary.upload_token) {
        throw new UploadValidationError("Choose an academic document upload.", 400);
      }
      ({ buffer, mimeType } = await downloadTemporaryUpload(temporary));
      docType = temporary.document_type;
      claim = { id: temporary.extraction_id, token: temporary.upload_token, sessionId, counselorId: user.id };
    } else {
      const file = await readAcademicUpload(request);
      ({ buffer, mimeType, docType } = file);
      claim = await academicDocumentStore.claim(sessionId, user.id, docType, file.replaceDocumentId);
    }
    // SW-05 waiver: approved extraction bytes go directly to the paid provider.
    // All PDF pages are preserved; staging raw files are deleted after processing.
    const image = mimeType === "application/pdf" ? await renderAcademicPdf(buffer) : buffer;
    const extraction = await geminiExtractionService.extract(image, docType, sessionId, user.id,
      mimeType === "application/pdf" ? "image/jpeg" : mimeType, claim);
    committed = true;
    const cleanupPending = temporary ? await cleanupTemporaryUpload(temporary)
      : (await drainExtractionCleanup(sessionId).catch(() => ({ failed: 1 }))).failed > 0;
    temporary = undefined;
    return Response.json({
      documentId: extraction.id, extractionResultId: extraction.id, docType,
      structuredData: extraction.structured_data, originalData: extraction.original_data,
      revision: extraction.draft_revision, evidenceState: extraction.evidence_state, provenance: extraction.provenance,
      cleanupPending, status: "complete",
    }, { headers: draftHeaders });
  } catch (error) {
    return uploadErrorResponse(error) ?? Response.json({ error: "Extraction failed. Retry or replace the file; the previous saved document is preserved." }, { status: 500, headers: draftHeaders });
  } finally {
    if (temporary) await cleanupTemporaryUpload(temporary);
    if (claim && !committed) await academicDocumentStore.release(claim).catch(() => {
      console.error("[extraction] Upload reservation release failed");
    });
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
    const cleanup = await drainExtractionCleanup(sessionId).catch(() => ({ failed: 1 }));
    return Response.json({ status: "removed", cleanupPending: cleanup.failed > 0 }, { headers: draftHeaders });
  } catch (error) {
    return uploadErrorResponse(error) ?? Response.json({ error: "Could not remove the document. Retry removal." }, { status: 500 });
  } finally {
    if (claim) await academicDocumentStore.release(claim).catch(() => {});
  }
}

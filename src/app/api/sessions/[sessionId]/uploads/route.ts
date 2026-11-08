import { requireUser, userOwnsSession, unauthorizedResponse, notFoundResponse } from "@/lib/auth/api-auth";
import { ACADEMIC_DOCUMENT_TYPES, ACADEMIC_MIME_TYPES, academicFileSizeError } from "@/lib/academic-upload-policy";
import { draftHeaders, intakeRpc } from "@/lib/module2/intake-draft-store";
import { uploadErrorResponse, UploadValidationError } from "@/lib/module2/academic-upload-validation";
import { readUploadJson, type TemporaryIntakeUpload, TEMPORARY_UPLOAD_BUCKET } from "@/lib/module2/temporary-intake-upload";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  const { sessionId } = await params;
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();
  try {
    const body = await readUploadJson(request);
    if (typeof body.size !== "number" || !Number.isInteger(body.size) || body.size < 0) {
      throw new UploadValidationError("Choose a file with a valid size.", 400);
    }
    const sizeError = academicFileSizeError({ size: body.size });
    if (sizeError) throw new UploadValidationError(sizeError, body.size ? 413 : 400);
    if (typeof body.docType !== "string" || ![...ACADEMIC_DOCUMENT_TYPES, "notes"].includes(body.docType)
      || typeof body.mimeType !== "string" || ![...ACADEMIC_MIME_TYPES, "application/octet-stream"].includes(body.mimeType)
      || (body.replaceDocumentId != null && (typeof body.replaceDocumentId !== "string"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.replaceDocumentId)))) {
      throw new UploadValidationError("Choose a JPEG, PNG, WEBP or PDF and its document type.", 400);
    }
    if (body.docType === "notes" && (body.notesReviewed !== true || body.mimeType === "application/pdf"
      || !Number.isInteger(body.revision) || Number(body.revision) < 0)) {
      throw new UploadValidationError("Review the prepared notes and choose a JPEG, PNG or WEBP photograph.", 400);
    }
    const upload = await intakeRpc<TemporaryIntakeUpload>("prepare_temporary_upload", {
      p_session_id: sessionId, p_counselor_id: user.id, p_document_type: body.docType,
      p_size: body.size, p_mime_type: body.mimeType, p_replace_id: body.replaceDocumentId ?? null,
      p_notes_revision: body.docType === "notes" ? body.revision : null,
    });
    return Response.json({ uploadId: upload.id, objectPath: upload.object_path, bucket: TEMPORARY_UPLOAD_BUCKET }, { headers: draftHeaders });
  } catch (error) {
    return uploadErrorResponse(error) ?? Response.json({ error: "Could not prepare the upload. Retry or reload the session." }, { status: 500, headers: draftHeaders });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  const { sessionId } = await params;
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();
  try {
    const body = await readUploadJson(request);
    if (typeof body.uploadId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.uploadId)) {
      throw new UploadValidationError("Invalid upload reference.", 400);
    }
    await intakeRpc("finish_temporary_upload", { p_session_id: sessionId, p_counselor_id: user.id, p_id: body.uploadId });
    return Response.json({ status: "cleanup_queued" }, { headers: draftHeaders });
  } catch (error) {
    return uploadErrorResponse(error) ?? Response.json({ error: "Upload cleanup is pending retry." }, { status: 500, headers: draftHeaders });
  }
}

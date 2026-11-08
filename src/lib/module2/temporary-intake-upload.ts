import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { academicFileSizeError } from "@/lib/academic-upload-policy";
import { intakeRpc } from "./intake-draft-store";
import { UploadValidationError, validateAcademicContent } from "./academic-upload-validation";
import { drainExtractionCleanup } from "./extraction-cleanup";

export const TEMPORARY_UPLOAD_BUCKET = "kumpas-intake-temp";

export interface TemporaryIntakeUpload {
  id: string;
  session_id: string;
  counselor_id: string;
  object_path: string;
  document_type: string;
  file_size: number;
  mime_type: string;
  extraction_id: string | null;
  upload_token: string | null;
  notes_revision: number | null;
}

export async function readUploadJson(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (!reader) throw new Error();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error(); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new UploadValidationError("Send a valid upload reference and document details.", 400);
  } finally { reader?.releaseLock(); }
}

export async function claimTemporaryUpload(sessionId: string, counselorId: string, uploadId: unknown) {
  if (typeof uploadId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) {
    throw new UploadValidationError("Choose the file again and retry the upload.", 400);
  }
  return intakeRpc<TemporaryIntakeUpload>("claim_temporary_upload", {
    p_session_id: sessionId, p_counselor_id: counselorId, p_id: uploadId,
  });
}

export async function downloadTemporaryUpload(upload: TemporaryIntakeUpload) {
  const { data, error } = await supabaseAdmin.storage.from(TEMPORARY_UPLOAD_BUCKET).download(upload.object_path);
  if (error || !data) throw new UploadValidationError("Could not read the uploaded file. Choose it again and retry.", 502);
  const sizeError = academicFileSizeError(data);
  if (sizeError) throw new UploadValidationError(sizeError, data.size ? 413 : 400);
  if (data.size !== upload.file_size) throw new UploadValidationError("The uploaded file size changed. Choose it again and retry.", 400);
  const buffer = Buffer.from(await data.arrayBuffer());
  const mimeType = await validateAcademicContent(buffer, upload.mime_type);
  return { buffer, mimeType };
}

// The pre-registered queue remains recoverable even if either operation throws.
export async function cleanupTemporaryUpload(upload: TemporaryIntakeUpload): Promise<boolean> {
  try {
    await intakeRpc("finish_temporary_upload", {
      p_session_id: upload.session_id, p_counselor_id: upload.counselor_id, p_id: upload.id,
    });
    const result = await drainExtractionCleanup(upload.session_id);
    return result.failed > 0 || result.pending;
  } catch { return true; }
}

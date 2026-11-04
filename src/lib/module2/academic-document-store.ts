import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { UploadValidationError } from "./academic-upload-validation";

export interface AcademicUploadClaim {
  id: string;
  token: string;
  previousPath: string | null;
}

const conflict = () => new UploadValidationError(
  "This document type already has a file or an upload in progress. Use Replace on the current file, or retry after the upload finishes.", 409,
);

export class AcademicDocumentStore {
  async claim(sessionId: string, counselorId: string, docType: string, replaceDocumentId: string | null): Promise<AcademicUploadClaim> {
    const { data: current, error: readError } = await supabaseAdmin.from("extraction_results")
      .select("id, redacted_image_path, structured_data").eq("session_id", sessionId).eq("document_type", docType).maybeSingle();
    if (readError) throw new Error("Could not check the existing document. Retry the upload.");
    const previousPath: string | null = current?.redacted_image_path ?? null;
    if (!previousPath && current?.structured_data?.type) {
      throw new UploadValidationError("This document has no current file reference. Start a new session to upload a replacement.", 409);
    }
    if (previousPath ? previousPath !== `${sessionId}/${replaceDocumentId}.jpg` : replaceDocumentId !== null) {
      throw conflict();
    }
    const token = randomUUID();
    const lease = { upload_token: token, upload_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() };
    if (!current) {
      const id = randomUUID();
      const { error } = await supabaseAdmin.from("extraction_results").insert({
        id, session_id: sessionId, counselor_id: counselorId, document_type: docType,
        structured_data: {}, ...lease,
      });
      if (error?.code === "23505") throw conflict();
      if (error) throw new Error("Could not reserve the document. Retry the upload.");
      return { id, token, previousPath };
    }
    let query = supabaseAdmin.from("extraction_results").update(lease).eq("id", current.id)
      .or(`upload_token.is.null,upload_expires_at.lt.${new Date().toISOString()}`);
    query = previousPath ? query.eq("redacted_image_path", previousPath) : query.is("redacted_image_path", null);
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw new Error("Could not reserve the document. Retry the upload.");
    if (!data) throw conflict();
    return { id: current.id, token, previousPath };
  }

  async release(claim: AcademicUploadClaim) {
    // Compare the token so a late invocation cannot erase a newer reservation.
    const query = claim.previousPath
      ? supabaseAdmin.from("extraction_results").update({ upload_token: null, upload_expires_at: null })
      : supabaseAdmin.from("extraction_results").delete();
    const { error } = await query.eq("id", claim.id).eq("upload_token", claim.token);
    if (error) throw new Error("Could not release the upload. Retry in ten minutes.");
  }

  async remove(claim: AcademicUploadClaim) {
    const { data, error } = await supabaseAdmin.from("extraction_results").delete()
      .eq("id", claim.id).eq("upload_token", claim.token).select("id").maybeSingle();
    if (error) throw new Error("Could not remove the document. Retry removal.");
    if (!data) throw conflict();
  }
}

export const academicDocumentStore = new AcademicDocumentStore();

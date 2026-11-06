import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { UploadValidationError } from "./academic-upload-validation";
import type { ExtractionDraft } from "@/types";
import type { ExtractedNotes } from "@/lib/analysis-types";
import { normalizeAcademicData } from "./extraction-contract";

export interface IntakeDraft {
  documents: ExtractionDraft[];
  notes: (ExtractedNotes & { revision: number; source: Record<string, unknown> | null; original: ExtractedNotes | null }) | null;
  uploadPending: boolean;
}

export async function intakeRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(name, args);
  if (error) {
    if (error.code === "P0002") throw new UploadValidationError("Session unavailable.", 404);
    if (error.code === "40001") throw new UploadValidationError("The saved draft changed or is locked. Reload before retrying.", 409);
    if (error.code === "22023") throw new UploadValidationError("Invalid document type.", 400);
    throw new Error("Draft persistence failed");
  }
  return data as T;
}

export async function readIntakeDraft(sessionId: string, counselorId: string) {
  const draft = await intakeRpc<IntakeDraft>("read_intake_draft", { p_session_id: sessionId, p_counselor_id: counselorId });
  // Older documents may omit nullable fields. Normalize for review without rewriting
  // their stored extraction or inventing historical source information.
  draft.documents = draft.documents.map((doc) => {
    try {
      return { ...doc, structured_data: normalizeAcademicData(doc.document_type, doc.structured_data.data),
        original_data: normalizeAcademicData(doc.document_type, (doc.original_data ?? doc.structured_data).data) };
    } catch {
      const empty = normalizeAcademicData(doc.document_type, {});
      return { ...doc, structured_data: empty, original_data: empty, evidence_state: "unreadable" };
    }
  });
  return draft;
}

export const draftHeaders = { "Cache-Control": "private, no-store" };

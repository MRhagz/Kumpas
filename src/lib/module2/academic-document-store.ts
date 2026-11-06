import type { ExtractionDraft } from "@/types";
import { intakeRpc } from "./intake-draft-store";

export interface AcademicUploadClaim {
  id: string;
  token: string;
  sessionId: string;
  counselorId: string;
}

export class AcademicDocumentStore {
  async claim(sessionId: string, counselorId: string, docType: string, replaceDocumentId: string | null): Promise<AcademicUploadClaim> {
    const row = await intakeRpc<ExtractionDraft & { upload_token: string }>("claim_academic_upload", {
      p_session_id: sessionId, p_counselor_id: counselorId, p_document_type: docType, p_replace_id: replaceDocumentId,
    });
    return { id: row.id, token: row.upload_token, sessionId, counselorId };
  }

  async release(claim: AcademicUploadClaim) {
    await intakeRpc("release_academic_upload", { p_id: claim.id, p_token: claim.token });
  }

  async remove(claim: AcademicUploadClaim) {
    await intakeRpc("remove_academic_upload", {
      p_session_id: claim.sessionId, p_counselor_id: claim.counselorId, p_id: claim.id, p_token: claim.token,
    });
  }
}

export const academicDocumentStore = new AcademicDocumentStore();

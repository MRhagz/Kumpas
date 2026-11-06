import "server-only";
import { intakeRpc, readIntakeDraft } from "./intake-draft-store";
import { academicFields } from "./extraction-contract";
import { UploadValidationError } from "./academic-upload-validation";
import type { ApprovedProfile, CorrectionLog } from "@/types";

export interface ReviewedInputs {
  profileVersion: number;
  notesRevision: number;
  documents: { id: string; revision: number }[];
}

interface ApproveInput extends ReviewedInputs {
  sessionId: string;
  counselorId: string;
  counselorNotes: ApprovedProfile["counselorNotes"];
}

export class StudentProfileBuilder {
  async buildAndSave(input: ApproveInput): Promise<ApprovedProfile> {
    const { sessionId, counselorId, counselorNotes } = input;
    const draft = await readIntakeDraft(sessionId, counselorId);
    const revisions = Object.fromEntries(input.documents.map(({ id, revision }) => [id, revision]));
    if (draft.uploadPending || draft.profileVersion !== input.profileVersion ||
        draft.notes?.revision !== input.notesRevision ||
        draft.documents.length !== input.documents.length ||
        draft.documents.some((doc) => revisions[doc.id] !== doc.draft_revision) ||
        Object.entries(counselorNotes).some(([key, value]) => draft.notes?.[key as keyof typeof counselorNotes] !== value)) {
      throw new UploadValidationError("Inputs changed or are still processing. Reload and review before approval.", 409);
    }

    const academicData: ApprovedProfile["academicData"] = {};
    const corrections: CorrectionLog[] = [];
    for (const doc of draft.documents) {
      if (doc.evidence_state !== "provided") continue;
      const data = doc.structured_data;
      if (data.type === "ncae") academicData.ncae = data.data;
      if (data.type === "nat") academicData.nat = data.data;
      if (data.type === "form_137") academicData.form137 = data.data;
      const original = academicFields(doc.original_data);
      for (const [field, value] of Object.entries(academicFields(data))) {
        if (original[field] !== value) corrections.push({
          session_id: sessionId, field_name: `${doc.document_type}.${field}`,
          extracted_value: original[field] == null ? null : String(original[field]),
          corrected_value: value == null ? "" : String(value),
        });
      }
    }

    // The database supplies version and confirmation time under the session lock.
    return intakeRpc<ApprovedProfile>("approve_reviewed_inputs", {
      p_session_id: sessionId, p_counselor_id: counselorId,
      p_expected_version: input.profileVersion, p_notes_revision: input.notesRevision,
      p_documents: revisions,
      p_profile: { sessionId, counselorNotes, academicData,
        inputEvidence: {
          documents: draft.documents.map((doc) => ({ documentId: doc.id, documentType: doc.document_type,
            revision: doc.draft_revision, status: doc.evidence_state, source: doc.provenance })),
          notes: { revision: draft.notes!.revision, source: draft.notes!.source },
        } },
      p_corrections: corrections,
    });
  }
}

export const studentProfileBuilder = new StudentProfileBuilder();
export type { ProfileVersionContract } from "@/lib/module5/versioned-contracts";

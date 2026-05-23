import { supabaseAdmin } from "@/lib/supabase";
import type {
  ApprovedProfile,
  CorrectionLog,
  ExtractedAcademicData,
  NCAEData,
  Form137Data,
  NATData,
} from "@/types";

interface ApproveInput {
  sessionId: string;
  counselorNotes: ApprovedProfile["counselorNotes"];
  corrections: CorrectionLog[];
}

export class StudentProfileBuilder {
  async buildAndSave(input: ApproveInput): Promise<ApprovedProfile> {
    const { sessionId, counselorNotes, corrections } = input;

    const { data: extractions, error: fetchErr } = await supabaseAdmin
      .from("extraction_results")
      .select("document_type, structured_data")
      .eq("session_id", sessionId);
    if (fetchErr) throw new Error(`Failed to fetch extraction results: ${fetchErr.message}`);

    const academicData: ApprovedProfile["academicData"] = {};
    for (const ex of extractions ?? []) {
      const d = ex.structured_data as ExtractedAcademicData;
      if (d.type === "ncae") academicData.ncae = d.data as NCAEData;
      if (d.type === "form_137") academicData.form137 = d.data as Form137Data;
      if (d.type === "nat") academicData.nat = d.data as NATData;
    }

    const profile: ApprovedProfile = {
      sessionId,
      sessionTimestamp: new Date().toISOString(),
      counselorNotes,
      academicData,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("sessions")
      .update({ approved_profile: profile, last_activity: new Date().toISOString() })
      .eq("id", sessionId);
    if (updateErr) throw new Error(`Failed to save profile: ${updateErr.message}`);

    const { error: notesErr } = await supabaseAdmin
      .from("session_notes")
      .update({
        career_goal: counselorNotes.careerGoal,
        interests: counselorNotes.interests,
        financial: counselorNotes.financial,
        concerns: counselorNotes.concerns,
        impression: counselorNotes.impression,
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);
    if (notesErr) throw new Error(`Failed to update session notes: ${notesErr.message}`);

    if (corrections.length > 0) {
      const { error: corrErr } = await supabaseAdmin.from("correction_logs").insert(
        corrections.map((c) => ({
          session_id: sessionId,
          field_name: c.field_name,
          extracted_value: c.extracted_value ?? null,
          corrected_value: c.corrected_value,
        })),
      );
      if (corrErr) throw new Error(`Failed to log corrections: ${corrErr.message}`);
    }

    return profile;
  }
}

export const studentProfileBuilder = new StudentProfileBuilder();

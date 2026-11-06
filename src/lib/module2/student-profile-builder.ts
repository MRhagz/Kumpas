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
  counselorId: string;
  counselorNotes: ApprovedProfile["counselorNotes"];
  corrections: CorrectionLog[];
}

export class StudentProfileBuilder {
  async buildAndSave(input: ApproveInput): Promise<ApprovedProfile> {
    const { sessionId, counselorId, counselorNotes, corrections } = input;
    const { data: extractions, error: fetchErr } = await supabaseAdmin
      .from("extraction_results")
      .select("document_type, structured_data, upload_token, upload_expires_at")
      .eq("session_id", sessionId);
    if (fetchErr) throw new Error(`Failed to fetch extraction results: ${fetchErr.message}`);
    if (extractions?.some((entry) => entry.upload_token && Date.parse(entry.upload_expires_at) > Date.now())) {
      throw new Error("A document upload or removal is still in progress. Wait for it to finish and retry approval.");
    }

    const { data: session, error: sessionError } = await supabaseAdmin.from("sessions")
      .select("current_profile_version").eq("id", sessionId).eq("counselor_id", counselorId).single();
    if (sessionError || !session) throw new Error("Session unavailable. Return to Confirm Information.");

    const academicData: ApprovedProfile["academicData"] = {};
    // The upload store enforces at most one current record of each academic type.
    const form137Subjects: Form137Data["subjects"] = [];
    let form137SchoolYear: string | undefined;
    let form137Gwa: number | undefined;

    for (const ex of extractions ?? []) {
      const d = ex.structured_data as ExtractedAcademicData;
      if (d.type === "ncae") academicData.ncae = d.data as NCAEData;
      if (d.type === "nat") academicData.nat = d.data as NATData;
      if (d.type === "form_137") {
        const f137 = d.data as Form137Data;
        form137Subjects.push(...f137.subjects);
        // School year strings are "YYYY-YYYY" so lexicographic compare matches chronological.
        if (f137.school_year && (!form137SchoolYear || f137.school_year > form137SchoolYear)) {
          form137SchoolYear = f137.school_year;
        }
        if (typeof f137.gwa === "number" && form137Gwa === undefined) {
          form137Gwa = f137.gwa;
        }
      }
    }

    if (form137Subjects.length > 0) {
      academicData.form137 = {
        subjects: form137Subjects,
        ...(form137SchoolYear ? { school_year: form137SchoolYear } : {}),
        ...(form137Gwa !== undefined ? { gwa: form137Gwa } : {}),
      };
    }

    const profile: ApprovedProfile = {
      sessionId,
      sessionTimestamp: new Date().toISOString(),
      counselorNotes,
      academicData,
    };

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

    const { error: approvalError } = await supabaseAdmin.rpc("approve_and_start_analysis", {
      p_session_id: sessionId, p_counselor_id: counselorId,
      p_expected_version: session.current_profile_version, p_profile: profile,
    });
    if (approvalError) throw new Error("Approval changed or session expired. Review inputs and retry approval.");

    return profile;
  }
}

export const studentProfileBuilder = new StudentProfileBuilder();

// Versioned workflow contract for downstream integration; legacy DTOs remain unchanged.
export type { ProfileVersionContract } from "@/lib/module5/versioned-contracts";

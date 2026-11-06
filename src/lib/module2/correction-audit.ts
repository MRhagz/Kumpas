import type { CorrectionLog, ExtractedAcademicData } from "@/types";

// Audit keys never contain provider/counselor supplied labels or document IDs.
// Free text is not an accuracy-evaluation value; retain only bounded academic
// categories, formatted school years and numeric scores.
function correctionAuditFields(extraction: ExtractedAcademicData, identities: string[]): Record<string, string | null> {
  const fields: Record<string, string | null> = {};
  const put = (key: string, value: number | string | null | undefined) => {
    fields[`${extraction.type}.${key}`] = value == null ? null : String(value);
  };
  switch (extraction.type) {
    case "ncae":
      identities.forEach((key, index) => put(`strand_scores.${index}`, extraction.data.strand_scores[key]));
      put("overall_percentile", extraction.data.overall_percentile);
      if (extraction.data.recommended_strand == null || /^(ABM|HUMSS|STEM|GAS|TVL|Sports|Arts and Design)$/i.test(extraction.data.recommended_strand)) {
        put("recommended_strand", extraction.data.recommended_strand);
      }
      break;
    case "nat":
      identities.forEach((key, index) => put(`subjects.${index}`, extraction.data.subjects[key]));
      put("composite_score", extraction.data.composite_score);
      if (extraction.data.mastery_level == null || /^(absolutely no mastery|very low mastery|low mastery|average mastery|moving towards mastery|closely approximating mastery|mastered)$/i.test(extraction.data.mastery_level)) {
        put("mastery_level", extraction.data.mastery_level);
      }
      break;
    case "form_137":
      identities.forEach((key, index) => put(`subjects.${index}.grade`,
        extraction.data.subjects.find((row, position) => (row.id ?? String(position)) === key)?.grade));
      put("gwa", extraction.data.gwa);
      if (extraction.data.school_year == null || /^\d{4}-\d{4}$/.test(extraction.data.school_year)) put("school_year", extraction.data.school_year);
  }
  return fields;
}

export function academicCorrections(sessionId: string, original: ExtractedAcademicData, corrected: ExtractedAcademicData): CorrectionLog[] {
  const keys = (doc: ExtractedAcademicData): string[] => doc.type === "ncae" ? Object.keys(doc.data.strand_scores)
    : doc.type === "nat" ? Object.keys(doc.data.subjects) : doc.data.subjects.map((row, index) => row.id ?? String(index));
  const identities = [...new Set([...keys(original), ...keys(corrected)])];
  const before = correctionAuditFields(original, identities);
  const after = correctionAuditFields(corrected, identities);
  return Object.entries(after).flatMap(([field_name, value]) => {
    // An unsafe original value must not enter the log even when corrected.
    if (!(field_name in before) || before[field_name] === value) return [];
    return [{ session_id: sessionId, field_name, extracted_value: before[field_name], corrected_value: value ?? "" }];
  });
}

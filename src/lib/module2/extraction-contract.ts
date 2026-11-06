import type { ExtractedAcademicData } from "@/types";

export const EXTRACTION_PROMPT_VERSION = "sw06-v1";
export const NOTE_KEYS = ["careerGoal", "interests", "financial", "concerns", "impression"] as const;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid extraction object");
  return value as Record<string, unknown>;
}

function score(value: unknown, minimum = 0): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > 100) {
    throw new Error("Invalid extraction score");
  }
  return value;
}

function text(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 200) throw new Error("Invalid extraction label");
  return value;
}

function scores(value: unknown): Record<string, number | null> {
  return Object.fromEntries(Object.entries(object(value ?? {})).map(([key, value]) => {
    if (!key.trim() || key.length > 200) throw new Error("Invalid extraction field");
    return [key, score(value)];
  }));
}

// Shared by provider validation and draft saves. Unknown properties are discarded.
export function normalizeAcademicData(type: string, input: unknown): ExtractedAcademicData {
  const data = object(input);
  switch (type) {
    case "ncae": return { type, data: {
      strand_scores: scores(data.strand_scores), overall_percentile: score(data.overall_percentile),
      recommended_strand: text(data.recommended_strand),
    } };
    case "nat": return { type, data: {
      subjects: scores(data.subjects), composite_score: score(data.composite_score), mastery_level: text(data.mastery_level),
    } };
    case "form_137": {
      if (data.subjects != null && !Array.isArray(data.subjects)) throw new Error("Invalid subject rows");
      const subjects = ((data.subjects ?? []) as unknown[]).map((entry) => {
        const row = object(entry);
        const name = text(row.name);
        if (!name) throw new Error("Missing subject name");
        return {
          ...(typeof row.id === "string" && /^[0-9a-f-]{36}$/i.test(row.id) ? { id: row.id } : {}),
          name, grade: score(row.grade, 60), year: text(row.year) ?? "", grade_level: text(row.grade_level),
        };
      });
      return { type, data: { subjects, gwa: score(data.gwa, 60), school_year: text(data.school_year) } };
    }
    default: throw new Error("Unsupported document category");
  }
}

export function normalizeNotes(input: unknown) {
  const data = object(input);
  return Object.fromEntries(NOTE_KEYS.map((key) => {
    const value = data[key] ?? "";
    if (typeof value !== "string" || value.length > 20_000) throw new Error("Invalid notes field");
    return [key, value];
  })) as Record<typeof NOTE_KEYS[number], string>;
}

export function academicFields(extraction: ExtractedAcademicData): Record<string, number | string | null> {
  switch (extraction.type) {
    case "ncae": return { ...Object.fromEntries(Object.entries(extraction.data.strand_scores).map(([k, v]) => [`strand_scores.${k}`, v])),
      overall_percentile: extraction.data.overall_percentile ?? null, recommended_strand: extraction.data.recommended_strand ?? null };
    case "nat": return { ...Object.fromEntries(Object.entries(extraction.data.subjects).map(([k, v]) => [`subjects.${k}`, v])),
      composite_score: extraction.data.composite_score ?? null, mastery_level: extraction.data.mastery_level ?? null };
    case "form_137": return { ...Object.fromEntries(extraction.data.subjects.map((row, i) => [`subjects.${row.id ?? i}.grade`, row.grade])),
      gwa: extraction.data.gwa ?? null, school_year: extraction.data.school_year ?? null };
  }
}

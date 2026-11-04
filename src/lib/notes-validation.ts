import type { ExtractedNotes } from "./analysis-types";

export const REQUIRED_NOTE_FIELDS = ["careerGoal", "interests"] as const;
export const OPTIONAL_NOTE_FIELDS = ["financial", "concerns", "impression"] as const;

// Contenteditable editors emit markup and non-breaking spaces even when empty.
export function hasNoteText(value: unknown): value is string {
  return typeof value === "string" && value
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:nbsp|#0*160|#x0*a0);/gi, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim().length > 0;
}

export function requiredNotesFilled(notes: ExtractedNotes): boolean {
  return REQUIRED_NOTE_FIELDS.every((field) => hasNoteText(notes[field]));
}

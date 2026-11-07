import type { CandidateCareerPath, ComponentEvidence } from "@/lib/module3/types";

export type EvidenceDimension = "aptitude" | "demand" | "feasibility";
export interface EvidenceClaim {
  dimension: EvidenceDimension;
  text: string;
  inputReferences: string[];
  sourceReferences: ComponentEvidence["sourceReferences"];
}
export const EVIDENCE_DIMENSIONS = ["aptitude", "demand", "feasibility"] as const;

export function sourceDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time === 0) return null; // Legacy missing-source sentinel.
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return value;
}

export function publicSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? value : null;
  } catch { return null; }
}

export function inputLabel(reference: string): string {
  const notes: Record<string, string> = {
    "counselorNotes.careerGoal": "reviewed career goal",
    "counselorNotes.interests": "self-reported career interests (not measured academic performance)",
    "counselorNotes.financial": "reviewed financial context (details withheld)",
    "counselorNotes.concerns": "reviewed constraints (details withheld)",
  };
  return notes[reference] ?? reference.replace(/^academicData\.nat\./, "NAT ").replace(/^academicData\.ncae\./, "NCAE ")
    .replace(/^academicData\.form137\./, "Form 137 ").replaceAll(".", " ").replaceAll("_", " ");
}

// Only server-authored statements are published. Model prose, specialist narratives,
// and confidential note values never enter these statements.
export function evidenceClaims(path: Pick<CandidateCareerPath, "componentEvidence" | "aptitudeScore" | "demandScore" | "feasibilityScore" | "sourceReferences">): EvidenceClaim[] {
  return EVIDENCE_DIMENSIONS.flatMap((dimension) => {
    const evidence = path.componentEvidence?.[dimension], score = path[`${dimension}Score`];
    if (!evidence || typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) return [];
    const inputs = evidence.inputReferences.map(inputLabel);
    const citations = evidence.sourceReferences.map((ref) => path.sourceReferences.findIndex((source) => source.reference === ref.reference && source.chunkIndex === ref.chunkIndex && (ref.siloId === undefined || ref.siloId === source.siloId)) + 1);
    if (citations.some((index) => index === 0)) return [];
    const basis = [...inputs, ...(citations.length ? [`public evidence ${citations.map((index) => `[${index}]`).join(", ")}`] : [])];
    if (!basis.length) return [];
    return [{ dimension, text: `${dimension[0].toUpperCase()}${dimension.slice(1)} comparison ${score}/100 uses ${basis.join(" and ")}.`,
      inputReferences: [...evidence.inputReferences], sourceReferences: evidence.sourceReferences.map((ref) => ({ ...ref })) }];
  });
}

export function summaryText(claims: EvidenceClaim[]): string {
  return claims.map((claim) => claim.text).join(" ");
}

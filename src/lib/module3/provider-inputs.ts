import "server-only";

import type { ApprovedProfile, ExtractedAcademicData } from "@/types";
import type { AgentName } from "./types";

// Copy documented academic fields, never an entire persisted profile/model object.
export function selectAcademicData(data: ApprovedProfile["academicData"]): ApprovedProfile["academicData"] {
  const number = (value: number | null | undefined) => value == null ? value : typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const text = (value: string | null | undefined) => value == null ? value : typeof value === "string" ? value : undefined;
  const numbers = (values: Record<string, number | null> | undefined) =>
    Object.fromEntries(Object.entries(values ?? {}).filter(([, v]) => v === null || (typeof v === "number" && Number.isFinite(v))));
  return {
    ...(data.ncae && { ncae: {
      strand_scores: numbers(data.ncae.strand_scores),
      overall_percentile: number(data.ncae.overall_percentile),
      recommended_strand: text(data.ncae.recommended_strand),
    } }),
    ...(data.form137 && { form137: {
      subjects: (data.form137.subjects ?? []).map(({ name, grade, year }) => ({
        name: text(name) ?? "", grade: number(grade) ?? null, year: text(year) ?? "",
      })),
      gwa: number(data.form137.gwa),
      school_year: text(data.form137.school_year),
    } }),
    ...(data.nat && { nat: {
      subjects: numbers(data.nat.subjects),
      composite_score: number(data.nat.composite_score),
      mastery_level: text(data.nat.mastery_level),
    } }),
  };
}

export function selectAgentAnalysis(agent: AgentName, text: string): string {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.summary !== "string" || !data.summary.trim()) {
    throw new Error("Invalid specialist analysis: a nonempty summary is required.");
  }
  const strings = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string") : [];
  const summary = typeof data.summary === "string" ? data.summary : "";
  switch (agent) {
    case "AcademicAuditor":
      return JSON.stringify({
        aptitude_signals: strings(data.aptitude_signals),
        subject_mastery: { strongest: strings(data.subject_mastery?.strongest), weakest: strings(data.subject_mastery?.weakest) },
        strengths: strings(data.strengths), weaknesses: strings(data.weaknesses),
        occupational_demand_signals: strings(data.occupational_demand_signals), summary,
      });
    case "IndustryAnalyst":
      return JSON.stringify({
        in_demand_occupations: strings(data.in_demand_occupations), sector_trends: strings(data.sector_trends),
        positive_outlook_signals: strings(data.positive_outlook_signals), cautionary_signals: strings(data.cautionary_signals),
        goal_market_alignment: ["high", "moderate", "low"].includes(data.goal_market_alignment) ? data.goal_market_alignment : null, summary,
      });
    case "FeasibilityStrategist":
      return JSON.stringify({
        eligible_scholarships: strings(data.eligible_scholarships),
        tesda_options: Array.isArray(data.tesda_options) ? data.tesda_options.map((item: { program?: unknown; estimated_cost?: unknown }) => ({
          program: typeof item?.program === "string" ? item.program : "",
          estimated_cost: typeof item?.estimated_cost === "string" ? item.estimated_cost : "",
        })) : [],
        feasibility_assessment: ["high", "moderate", "low"].includes(data.feasibility_assessment) ? data.feasibility_assessment : null,
        cost_barriers: strings(data.cost_barriers), financial_risks: strings(data.financial_risks), summary,
      });
  }
}

export function selectExtractionData(type: string, parsed: unknown): ExtractedAcademicData {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid academic extraction response.");
  }
  const key = type === "form_137" ? "form137" : type;
  const data = selectAcademicData({ [key]: parsed } as ApprovedProfile["academicData"]);
  return { type, data: data[key as keyof typeof data] } as ExtractedAcademicData;
}

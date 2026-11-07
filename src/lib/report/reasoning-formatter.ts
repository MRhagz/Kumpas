import type { AcademicEvidenceSummary, RankedRecommendationList, RankedRecommendation, StudentReportSummary } from "@/lib/report/types";
import { evidenceClaims, summaryText, type EvidenceClaim } from "./evidence-summary";

export interface FormattedReasoningSummary {
  recommendationId: string;
  careerPath: string;
  summary: string;
  isPlaceholder: boolean;
  concerns: string[];
  claims: EvidenceClaim[];
}

export interface ReasoningSummaryFormatterOptions {
  maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 700;
const PLACEHOLDER_SUMMARY =
  "Evidence summary unavailable. Review the approved inputs and cited sources with the counselor before using this comparison.";

export function formatReasoningSummary(
  recommendation: RankedRecommendation,
  options: ReasoningSummaryFormatterOptions = {},
): FormattedReasoningSummary {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const claims = evidenceClaims({ componentEvidence: recommendation.componentEvidence ?? { aptitude: null, demand: null, feasibility: null },
    aptitudeScore: recommendation.aptitudeFit, demandScore: recommendation.marketDemand, feasibilityScore: recommendation.financialFeasibility,
    sourceReferences: recommendation.sources });
  const normalizedSummary = summaryText(claims);
  const isPlaceholder = !claims.length || recommendation.reasoningSummary !== normalizedSummary;
  const summary = isPlaceholder
    ? PLACEHOLDER_SUMMARY
    : truncateAtSentenceBoundary(normalizedSummary, maxLength);

  return {
    recommendationId: recommendation.id,
    careerPath: recommendation.careerPath,
    summary,
    isPlaceholder,
    concerns: buildConcerns(recommendation),
    claims: isPlaceholder ? [] : claims,
  };
}

export function formatReasoningSummaries(
  recommendations: RankedRecommendation[],
  options: ReasoningSummaryFormatterOptions = {},
): FormattedReasoningSummary[] {
  return recommendations.map((recommendation) =>
    formatReasoningSummary(recommendation, options),
  );
}

/** Student wording uses evidence categories, never note values or model prose. */
export function buildStudentSummary(
  list: RankedRecommendationList,
  evidence: AcademicEvidenceSummary,
): StudentReportSummary {
  const limitations = [
    list.recommendations.some((option) => option.sources.length)
      ? "Source currency is unverified. Ask your counselor to check for newer information."
      : "No supporting reference sources are available. Review this evidence gap with your counselor.",
  ];
  if (evidence.missingDocuments.length) limitations.push(
    `Missing academic evidence: ${evidence.missingDocuments.map(documentLabel).join(", ")}. These records cannot support this comparison.`,
  );
  if (!evidence.availableDocuments.length) limitations.push(
    "No usable academic records are available. Reported interests are not measured academic performance.",
  );
  for (const [document, status] of Object.entries(evidence.documentStatuses ?? {})) {
    if (status === "unreadable" || status === "unsupported") limitations.push(`${documentLabel(document)} was ${status}; it provides no usable evidence.`);
  }
  if (list.recommendations.filter((option) => option.rank !== null).length < 3) limitations.push(
    "Fewer than three scored paths are supported. Missing scores are not zero, and partial options have no total or rank.",
  );
  if (list.agentStatuses?.some((agent) => agent.status !== "SUCCESS")) limitations.push(
    "Some specialist analysis is unavailable. Discuss the missing evidence before deciding.",
  );
  return {
    disclosure: "AI-generated comparisons use counselor-confirmed inputs and available reference sources. They support discussion, not a decision about your future. Your counselor reviews the evidence and helps you decide.",
    scoreExplanation: "The alignment score compares supported options using aptitude (fit with available evidence), demand (work opportunities), and feasibility (practical requirements). Scores are points out of 100, not probabilities of career success. A higher score is not a guarantee.",
    scope: "For Grade 10 and Senior High School (SHS) guidance. Your current education stage is not confirmed by this report.",
    options: list.recommendations.map((option) => {
      const formatted = formatReasoningSummary(option, { maxLength: Number.MAX_SAFE_INTEGER });
      const reasons = formatted.claims.map((claim) => {
        if (claim.dimension === "aptitude") {
          const basis = [];
          if (claim.inputReferences.some((ref) => ref.startsWith("academicData."))) basis.push("reviewed academic records");
          if (claim.inputReferences.some((ref) => ref.startsWith("counselorNotes."))) basis.push("reviewed, self-reported interests or goals (not measured academic performance)");
          if (claim.sourceReferences.length) basis.push("cited public records");
          return `Aptitude comparison: ${option.aptitudeFit!.toFixed(2)} out of 100, supported by ${basis.join(" and ") || "reviewed input references"}.`;
        }
        return claim.dimension === "demand"
          ? `Work-opportunity comparison: ${option.marketDemand!.toFixed(2)} out of 100, using the cited public evidence.`
          : `Practical-requirements comparison: ${option.financialFeasibility!.toFixed(2)} out of 100, using reviewed context and cited evidence. Personal details are withheld.`;
      });
      const missing = [option.aptitudeFit === null ? "aptitude" : "", option.marketDemand === null ? "work opportunities" : "", option.financialFeasibility === null ? "practical requirements" : ""].filter(Boolean);
      const components = [{ label: "aptitude", score: option.aptitudeFit }, { label: "work opportunities", score: option.marketDemand }, { label: "practical requirements", score: option.financialFeasibility }];
      const scores = components.flatMap((component) => component.score === null ? [] : [component.score]);
      const lowest = Math.min(...scores);
      const tradeOff = !missing.length && lowest < Math.max(...scores)
        ? `Lowest component score: ${components.filter((component) => component.score === lowest).map((component) => component.label).join(" and ")} (${lowest.toFixed(2)}/100). Discuss this trade-off.` : null;
      return {
        id: option.id, careerPath: option.careerPath, rank: option.rank, alignmentScore: option.alignmentScore,
        reasons: reasons.length ? reasons : ["Evidence summary unavailable. Ask your counselor to review the inputs and sources before using this option."],
        considerations: [
          ...(missing.length ? [`Evidence unavailable for ${missing.join(", ")}. This option is unscored and has no rank.`] : []),
          ...(tradeOff ? [tradeOff] : []),
        ],
      };
    }),
    limitations,
    nextSteps: [
      "Discuss the options, their reasons and missing evidence with your counselor before choosing.",
      "If you are in Grade 10, discuss suitable Senior High School tracks. If you are finishing SHS, discuss further study, training or work options.",
      "Check current entry requirements, costs and financial support with the relevant school or training provider. Review this comparison when missing information becomes available.",
    ],
  };
}

export function documentLabel(document: string): string {
  return document === "form137" ? "Form 137 (school academic record)"
    : document === "ncae" ? "National Career Assessment Examination (NCAE)"
    : "National Achievement Test (NAT)";
}

function buildConcerns(recommendation: RankedRecommendation): string[] {
  const concerns: string[] = [];

  if (recommendation.status === "degraded") {
    concerns.push(
      recommendation.degradedReason ??
        "This recommendation was generated with partial reasoning coverage.",
    );
  }

  if (recommendation.status === "incomplete") {
    concerns.push(
      recommendation.incompleteReason ??
        "This recommendation is missing at least one contributing analysis output.",
    );
  }

  const missing = [recommendation.aptitudeFit === null ? "aptitude" : "", recommendation.marketDemand === null ? "demand" : "", recommendation.financialFeasibility === null ? "feasibility" : ""].filter(Boolean);
  if (missing.length) concerns.push(`Missing evidence: ${missing.join(", ")}; no total or rank is assigned.`);
  if (recommendation.sources.length) concerns.push("Source currency is unverified. Check for outdated or superseding evidence before using this comparison.");
  return concerns;
}

function truncateAtSentenceBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const truncated = value.slice(0, maxLength).trimEnd();
  const sentenceEnd = Math.max(
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf("?"),
  );

  if (sentenceEnd >= maxLength * 0.6) {
    return truncated.slice(0, sentenceEnd + 1);
  }

  return `${truncated.replace(/[,\s]+$/, "")}...`;
}

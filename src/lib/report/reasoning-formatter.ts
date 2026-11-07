import type { RankedRecommendation } from "@/lib/report/types";
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

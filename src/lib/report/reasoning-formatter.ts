import type { RankedRecommendation } from "@/lib/report/types";

export interface FormattedReasoningSummary {
  recommendationId: string;
  careerPath: string;
  summary: string;
  isPlaceholder: boolean;
  concerns: string[];
}

export interface ReasoningSummaryFormatterOptions {
  maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 700;
const PLACEHOLDER_SUMMARY =
  "A detailed reasoning summary is not available for this recommendation. Review the alignment score, key signals, and source references before presenting it to the student.";

export function formatReasoningSummary(
  recommendation: RankedRecommendation,
  options: ReasoningSummaryFormatterOptions = {},
): FormattedReasoningSummary {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const normalizedSummary = normalizeWhitespace(recommendation.reasoningSummary);
  const isPlaceholder = normalizedSummary.length === 0;
  const summary = isPlaceholder
    ? PLACEHOLDER_SUMMARY
    : truncateAtSentenceBoundary(normalizedSummary, maxLength);

  return {
    recommendationId: recommendation.id,
    careerPath: recommendation.careerPath,
    summary,
    isPlaceholder,
    concerns: buildConcerns(recommendation),
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

  return concerns;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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

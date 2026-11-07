import type {
  AuditTrailEntry,
  RankedRecommendation,
  RankedRecommendationList,
  RecommendationSource,
} from "@/lib/report/types";
import { sourceDate, publicSourceUrl } from "./evidence-summary";

export interface AuditTrailBuildOptions {
  includeSourceUnavailableEntries?: boolean;
}

const SOURCE_UNAVAILABLE_REFERENCE = "source-unavailable";

export function buildAuditTrail(
  rankedRecommendations: RankedRecommendationList,
  options: AuditTrailBuildOptions = {},
): AuditTrailEntry[] {
  const includeUnavailable = options.includeSourceUnavailableEntries ?? true;

  return rankedRecommendations.recommendations.map((recommendation) => ({
    recommendationId: recommendation.id,
    careerPath: recommendation.careerPath,
    sources: buildRecommendationSources(recommendation, includeUnavailable),
  }));
}

export function validateAuditTrail(auditTrail: AuditTrailEntry[]): string[] {
  const errors: string[] = [];

  auditTrail.forEach((entry, entryIndex) => {
    const label = `Audit trail entry ${entryIndex + 1}`;

    if (!entry.recommendationId.trim()) {
      errors.push(`${label} requires a recommendation id.`);
    }

    if (!entry.careerPath.trim()) {
      errors.push(`${label} requires a career path.`);
    }

    if (entry.sources.length === 0) {
      errors.push(`${label} requires at least one source.`);
    }

    entry.sources.forEach((source, sourceIndex) => {
      const sourceLabel = `${label} source ${sourceIndex + 1}`;

      if (!source.id.trim()) {
        errors.push(`${sourceLabel} requires an id.`);
      }

      if (!source.title.trim()) {
        errors.push(`${sourceLabel} requires a title.`);
      }

      if (!source.reference.trim()) {
        errors.push(`${sourceLabel} requires a reference.`);
      }

      if (source.ingestionTimestamp !== null && Number.isNaN(Date.parse(source.ingestionTimestamp))) {
        errors.push(`${sourceLabel} requires a valid ingestion timestamp.`);
      }
    });
  });

  return errors;
}

function buildRecommendationSources(
  recommendation: RankedRecommendation,
  includeUnavailable: boolean,
): RecommendationSource[] {
  if (recommendation.sources.length > 0) {
    return recommendation.sources.map((source) => ({ ...source, ingestionTimestamp: sourceDate(source.ingestionTimestamp),
      publicationDate: sourceDate(source.publicationDate), sourceUrl: publicSourceUrl(source.sourceUrl) ?? publicSourceUrl(source.reference) }));
  }

  if (!includeUnavailable) {
    return [];
  }

  return [buildSourceUnavailableEntry(recommendation)];
}

function buildSourceUnavailableEntry(
  recommendation: RankedRecommendation,
): RecommendationSource {
  return {
    id: `${recommendation.id}-source-unavailable`,
    title: "Source unavailable",
    reference: SOURCE_UNAVAILABLE_REFERENCE,
    acquisitionMethod: "unknown",
    ingestionTimestamp: null,
    publicationDate: null,
    sourceUrl: null,
    relatedSignals: recommendation.keySignals,
  };
}

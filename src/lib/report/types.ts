export type RecommendationStatus = "complete" | "degraded" | "incomplete";

export type AcademicDocumentType = "form137" | "ncae" | "nat";

export type SourceAcquisitionMethod =
  | "automated_csv"
  | "automated_pdf"
  | "operator_curated_csv"
  | "operator_curated_pdf"
  | "manual_curation"
  | "uploaded_document"
  | "counselor_notes"
  | "retrieved_context"
  | "system_generated"
  | "unknown";

export interface StudentProfile {
  sessionId: string;
  displayName?: string;
  targetCareer?: string;
  interests: string[];
  strengths: string[];
  financialStatus: "stable" | "constrained" | "unknown";
  concerns: string[];
  approvedAt: string;
  /** Server-only confidential context used to withhold echoes in option titles. */
  withheldNoteValues?: string[];
}

export interface RecommendationSource {
  id: string;
  title: string;
  reference: string;
  acquisitionMethod: SourceAcquisitionMethod;
  ingestionTimestamp: string | null;
  publicationDate?: string | null;
  sourceUrl?: string | null;
  chunkIndex?: number;
  siloId?: string;
  relatedSignals: string[];
}

export type KeySignalPolarity = "positive" | "negative" | "neutral";

export interface KeySignalDetail {
  label: string;
  value: string;
  subNote?: string;
  polarity: KeySignalPolarity;
}

export interface RankedRecommendation {
  id: string;
  rank: number | null;
  careerPath: string;
  alignmentScore: number | null;
  aptitudeFit: number | null;
  marketDemand: number | null;
  financialFeasibility: number | null;
  reasoningSummary: string;
  keySignals: string[];
  keySignalDetails: KeySignalDetail[];
  sources: RecommendationSource[];
  approvedProfileVersion?: number | null;
  componentEvidence?: import("@/lib/module3/types").CandidateCareerPath["componentEvidence"];
  weights?: Readonly<{ aptitude: number; demand: number; feasibility: number }>;
  status: RecommendationStatus;
  degradedReason?: string;
  incompleteReason?: string;
}

export interface RankedRecommendationList {
  sessionId: string;
  generatedAt: string;
  recommendations: RankedRecommendation[];
  scoreContract?: "0-100-v1";
  limitation?: string;
  agentStatuses?: import("@/lib/module3/types").SpecialistStatus[];
}

export interface AcademicEvidenceSummary {
  availableDocuments: AcademicDocumentType[];
  missingDocuments: AcademicDocumentType[];
  completenessNote: string;
  documentStatuses?: Partial<Record<AcademicDocumentType, "provided" | "unreadable" | "unsupported" | "absent">>;
}

export interface StudentReportSummary {
  disclosure: string;
  scoreExplanation: string;
  scope: string;
  options: {
    id: string;
    careerPath: string;
    rank: number | null;
    alignmentScore: number | null;
    reasons: string[];
    considerations: string[];
  }[];
  limitations: string[];
  nextSteps: string[];
}

/** Bump the content version when changing the assembled student projection. */
export function reportContentMarker(reportVersion: number | null | undefined, profileVersion: number | null | undefined): string {
  return `% Kumpas two-audience-v1 report=${reportVersion ?? "unavailable"} profile=${profileVersion ?? "unavailable"}\n`;
}

export interface AuditTrailEntry {
  recommendationId: string;
  careerPath: string;
  sources: RecommendationSource[];
}

export interface ReportPayload {
  sessionId: string;
  reportVersion?: number | null;
  approvedProfileVersion?: number | null;
  studentSummary?: StudentReportSummary;
  studentProfile: StudentProfile;
  rankedRecommendations: RankedRecommendationList;
  academicEvidence: AcademicEvidenceSummary;
  auditTrail: AuditTrailEntry[];
  generatedAt: string;
}

export interface ReportGenerationResponse {
  agentStatuses?: import("@/lib/module3/types").SpecialistStatus[];
  sessionId: string;
  reportVersion: number;
  runId?: string;
  approvedProfileVersion?: number | null;
  reviewStatus?: "draft" | "approved" | "rejected";
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  previewUrl?: string | null;
  /** Null for PDFs produced before the two-audience content contract. */
  studentSummary?: StudentReportSummary | null;
  downloadUrl: string | null;
  expiresAt: string;
  generatedAt: string;
  byteLength: number;
  recommendationCount: number;
  academicEvidence: AcademicEvidenceSummary;
  recommendations: ReportRecommendationSummary[];
}

export interface ReportRecommendationSummary {
  evidenceClaims?: import("./evidence-summary").EvidenceClaim[];
  sources?: RecommendationSource[];
  incompleteReason?: string;
  id: string;
  rank: number | null;
  careerPath: string;
  alignmentScore: number | null;
  reasoningSummary: string;
  keySignals: string[];
  keySignalDetails: KeySignalDetail[];
}

const ACADEMIC_DOCUMENT_TYPES: AcademicDocumentType[] = ["form137", "ncae", "nat"];
const SOURCE_ACQUISITION_METHODS: SourceAcquisitionMethod[] = [
  "automated_csv",
  "automated_pdf",
  "operator_curated_csv",
  "operator_curated_pdf",
  "manual_curation",
  "uploaded_document",
  "counselor_notes",
  "retrieved_context",
  "system_generated",
  "unknown",
];
const KEY_SIGNAL_POLARITIES: KeySignalPolarity[] = [
  "positive",
  "negative",
  "neutral",
];

export function isAlignmentScore(score: unknown): score is number {
  return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100;
}

export function isSourceAcquisitionMethod(
  method: string,
): method is SourceAcquisitionMethod {
  return SOURCE_ACQUISITION_METHODS.includes(method as SourceAcquisitionMethod);
}

export function validateAcademicEvidenceSummary(
  evidence: AcademicEvidenceSummary,
): string[] {
  const errors: string[] = [];
  const availableDocuments = new Set(evidence.availableDocuments);
  const missingDocuments = new Set(evidence.missingDocuments);

  if (!evidence.completenessNote.trim()) {
    errors.push("Academic evidence requires a completeness note.");
  }

  ACADEMIC_DOCUMENT_TYPES.forEach((documentType) => {
    const isAvailable = availableDocuments.has(documentType);
    const isMissing = missingDocuments.has(documentType);

    if (isAvailable && isMissing) {
      errors.push(`${documentType} cannot be both available and missing.`);
    }

    if (!isAvailable && !isMissing) {
      errors.push(`${documentType} must be marked available or missing.`);
    }
  });

  evidence.availableDocuments.forEach((documentType) => {
    if (!ACADEMIC_DOCUMENT_TYPES.includes(documentType)) {
      errors.push(`Unknown available document type: ${documentType}.`);
    }
  });

  evidence.missingDocuments.forEach((documentType) => {
    if (!ACADEMIC_DOCUMENT_TYPES.includes(documentType)) {
      errors.push(`Unknown missing document type: ${documentType}.`);
    }
  });

  return errors;
}

export function validateRankedRecommendationList(
  list: RankedRecommendationList,
): string[] {
  const errors: string[] = [];
  const careerPaths = new Set<string>();

  if (!list.sessionId.trim()) {
    errors.push("Session id is required.");
  }

  if (Number.isNaN(Date.parse(list.generatedAt))) {
    errors.push("Generated timestamp must be a valid ISO date.");
  }

  if (list.recommendations.length === 0) errors.push("Insufficient evidence for a report.");

  list.recommendations.forEach((recommendation, index) => {
    const label = `Recommendation ${index + 1}`;

    if (!recommendation.id.trim()) {
      errors.push(`${label} requires an id.`);
    }

    if (!recommendation.careerPath.trim()) {
      errors.push(`${label} requires a career path.`);
    }

    const normalizedCareerPath = recommendation.careerPath.trim().toLowerCase();
    if (careerPaths.has(normalizedCareerPath)) {
      errors.push(`${label} duplicates another career path.`);
    }
    careerPaths.add(normalizedCareerPath);

    const components = [recommendation.aptitudeFit, recommendation.marketDemand, recommendation.financialFeasibility];
    if (components.every((s) => s === null)) errors.push(`${label} has no supported component evidence.`);
    const partial = components.some((s) => s === null);
    const previous = list.recommendations[index - 1];
    const expectedRank = partial ? null : previous && previous.alignmentScore === recommendation.alignmentScore ? previous.rank : index + 1;
    if (recommendation.rank !== expectedRank) errors.push(`${label} must use its shared rank or null for a partial comparison.`);
    if (partial && (recommendation.alignmentScore !== null || recommendation.status !== "incomplete" || !recommendation.incompleteReason)) errors.push(`${label} must be an explicitly unscored partial comparison.`);
    if (!partial && recommendation.alignmentScore === null) errors.push(`${label} requires a total.`);
    if (previous && previous.alignmentScore === null && !partial) errors.push(`${label} must precede unscored partial comparisons.`);
    if (previous && recommendation.alignmentScore !== null && previous.alignmentScore !== null && previous.alignmentScore < recommendation.alignmentScore) errors.push(`${label} is out of score order.`);
    if (previous && previous.alignmentScore === recommendation.alignmentScore && previous.careerPath.localeCompare(recommendation.careerPath, "en") > 0) errors.push(`${label} must use alphabetical tie order.`);

    const scoreFields = [
      ["alignmentScore", recommendation.alignmentScore],
      ["aptitudeFit", recommendation.aptitudeFit],
      ["marketDemand", recommendation.marketDemand],
      ["financialFeasibility", recommendation.financialFeasibility],
    ] as const;

    scoreFields.forEach(([fieldName, value]) => {
      if (value !== null && !isAlignmentScore(value)) {
        errors.push(`${label} ${fieldName} must be between 0 and 100 or null.`);
      }
    });

    if (!recommendation.reasoningSummary.trim()) {
      errors.push(`${label} requires a reasoning summary.`);
    }

    if (recommendation.keySignals.length === 0) {
      errors.push(`${label} requires at least one key signal.`);
    }

    recommendation.keySignalDetails.forEach((signal, signalIndex) => {
      const signalLabel = `${label} key signal ${signalIndex + 1}`;

      if (!signal.label.trim()) {
        errors.push(`${signalLabel} requires a label.`);
      }

      if (!signal.value.trim()) {
        errors.push(`${signalLabel} requires a value.`);
      }

      if (!KEY_SIGNAL_POLARITIES.includes(signal.polarity)) {
        errors.push(`${signalLabel} has unsupported polarity: ${signal.polarity}.`);
      }
    });

    recommendation.sources.forEach((source, sourceIndex) => {
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

      if (!isSourceAcquisitionMethod(source.acquisitionMethod)) {
        errors.push(
          `${sourceLabel} has unsupported acquisition method: ${source.acquisitionMethod}.`,
        );
      }

      if (source.ingestionTimestamp !== null && Number.isNaN(Date.parse(source.ingestionTimestamp))) {
        errors.push(`${sourceLabel} ingestion timestamp must be a valid ISO date.`);
      }
    });
  });

  return errors;
}

// Versioned workflow contract for downstream integration; legacy DTOs remain unchanged.
export type { ReportVersionContract, ReportApprovalState } from "@/lib/module5/versioned-contracts";

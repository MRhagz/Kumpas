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
}

export interface RecommendationSource {
  id: string;
  title: string;
  reference: string;
  acquisitionMethod: SourceAcquisitionMethod;
  ingestionTimestamp: string;
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
  rank: number;
  careerPath: string;
  alignmentScore: number;
  aptitudeFit: number;
  marketDemand: number;
  financialFeasibility: number;
  reasoningSummary: string;
  keySignals: string[];
  keySignalDetails: KeySignalDetail[];
  sources: RecommendationSource[];
  status: RecommendationStatus;
  degradedReason?: string;
  incompleteReason?: string;
}

export interface RankedRecommendationList {
  sessionId: string;
  generatedAt: string;
  recommendations: RankedRecommendation[];
}

export interface AcademicEvidenceSummary {
  availableDocuments: AcademicDocumentType[];
  missingDocuments: AcademicDocumentType[];
  completenessNote: string;
}

export interface AuditTrailEntry {
  recommendationId: string;
  careerPath: string;
  sources: RecommendationSource[];
}

export interface ReportPayload {
  sessionId: string;
  studentProfile: StudentProfile;
  rankedRecommendations: RankedRecommendationList;
  academicEvidence: AcademicEvidenceSummary;
  auditTrail: AuditTrailEntry[];
  generatedAt: string;
}

export interface StoredReportPdf {
  sessionId: string;
  downloadUrl: string;
  expiresAt: string;
  createdAt: string;
  byteLength: number;
}

export interface ReportGenerationResponse {
  sessionId: string;
  downloadUrl: string;
  expiresAt: string;
  generatedAt: string;
  byteLength: number;
  recommendationCount: number;
  academicEvidence: AcademicEvidenceSummary;
  recommendations: ReportRecommendationSummary[];
}

export interface ReportRecommendationSummary {
  id: string;
  rank: number;
  careerPath: string;
  alignmentScore: number;
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

export function isNormalizedScore(score: number): boolean {
  return Number.isFinite(score) && score >= 0 && score <= 1;
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

  if (list.recommendations.length < 3) {
    errors.push("At least three recommendations are required.");
  }

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

    if (recommendation.rank !== index + 1) {
      errors.push(`${label} rank must match its list position.`);
    }

    const scoreFields = [
      ["alignmentScore", recommendation.alignmentScore],
      ["aptitudeFit", recommendation.aptitudeFit],
      ["marketDemand", recommendation.marketDemand],
      ["financialFeasibility", recommendation.financialFeasibility],
    ] as const;

    scoreFields.forEach(([fieldName, value]) => {
      if (!isNormalizedScore(value)) {
        errors.push(`${label} ${fieldName} must be between 0 and 1.`);
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

      if (Number.isNaN(Date.parse(source.ingestionTimestamp))) {
        errors.push(`${sourceLabel} ingestion timestamp must be a valid ISO date.`);
      }
    });
  });

  return errors;
}

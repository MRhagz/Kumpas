import type { RecommendationProvider } from "@/lib/report/provider";
import { mockRecommendationProvider } from "@/lib/report/provider";
import type {
  AuditTrailEntry,
  RankedRecommendationList,
  ReportPayload,
  StudentProfile,
} from "@/lib/report/types";
import { validateRankedRecommendationList } from "@/lib/report/types";

export interface AssembleReportDataOptions {
  provider?: RecommendationProvider;
  generatedAt?: string;
}

export class ReportAssemblyError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "ReportAssemblyError";
  }
}

export async function assembleReportData(
  sessionId: string,
  options: AssembleReportDataOptions = {},
): Promise<ReportPayload> {
  const provider = options.provider ?? mockRecommendationProvider;
  const [studentProfile, rankedRecommendations] = await Promise.all([
    provider.getApprovedStudentProfile(sessionId),
    provider.getRankedRecommendations(sessionId),
  ]);

  validateReportInputs(sessionId, studentProfile, rankedRecommendations);

  return {
    sessionId,
    studentProfile,
    rankedRecommendations,
    auditTrail: buildAuditTrail(rankedRecommendations),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  };
}

export function buildAuditTrail(
  rankedRecommendations: RankedRecommendationList,
): AuditTrailEntry[] {
  return rankedRecommendations.recommendations.map((recommendation) => ({
    recommendationId: recommendation.id,
    careerPath: recommendation.careerPath,
    sources: recommendation.sources,
  }));
}

function validateReportInputs(
  sessionId: string,
  studentProfile: StudentProfile,
  rankedRecommendations: RankedRecommendationList,
): void {
  const errors = [
    ...validateStudentProfile(sessionId, studentProfile),
    ...validateRankedRecommendationList(rankedRecommendations),
  ];

  if (rankedRecommendations.sessionId !== sessionId) {
    errors.push("Ranked recommendations must belong to the requested session.");
  }

  if (errors.length > 0) {
    throw new ReportAssemblyError("Report data assembly failed.", errors);
  }
}

function validateStudentProfile(
  sessionId: string,
  studentProfile: StudentProfile,
): string[] {
  const errors: string[] = [];

  if (studentProfile.sessionId !== sessionId) {
    errors.push("Student profile must belong to the requested session.");
  }

  if (Number.isNaN(Date.parse(studentProfile.approvedAt))) {
    errors.push("Student profile approval timestamp must be a valid ISO date.");
  }

  if (studentProfile.interests.length === 0) {
    errors.push("Student profile requires at least one interest.");
  }

  if (studentProfile.strengths.length === 0) {
    errors.push("Student profile requires at least one strength.");
  }

  return errors;
}


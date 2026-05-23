import { buildAuditTrail, validateAuditTrail } from "@/lib/report/audit-trail";
import { module3RecommendationProvider } from "@/lib/module3/recommendation-provider";
import type { RecommendationProvider } from "@/lib/report/provider";
import type {
  AcademicEvidenceSummary,
  RankedRecommendationList,
  ReportPayload,
  StudentProfile,
} from "@/lib/report/types";
import {
  validateAcademicEvidenceSummary,
  validateRankedRecommendationList,
} from "@/lib/report/types";

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
  const provider = options.provider ?? module3RecommendationProvider;
  const [studentProfile, rankedRecommendations, academicEvidence] = await Promise.all([
    provider.getApprovedStudentProfile(sessionId),
    provider.getRankedRecommendations(sessionId),
    provider.getAcademicEvidenceSummary(sessionId),
  ]);

  validateReportInputs(
    sessionId,
    studentProfile,
    rankedRecommendations,
    academicEvidence,
  );
  const auditTrail = buildAuditTrail(rankedRecommendations);
  validateReportAuditTrail(auditTrail);

  return {
    sessionId,
    studentProfile,
    rankedRecommendations,
    academicEvidence,
    auditTrail,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  };
}

function validateReportInputs(
  sessionId: string,
  studentProfile: StudentProfile,
  rankedRecommendations: RankedRecommendationList,
  academicEvidence: AcademicEvidenceSummary,
): void {
  const errors = [
    ...validateStudentProfile(sessionId, studentProfile),
    ...validateRankedRecommendationList(rankedRecommendations),
    ...validateAcademicEvidenceSummary(academicEvidence),
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

function validateReportAuditTrail(
  auditTrail: ReturnType<typeof buildAuditTrail>,
): void {
  const errors = validateAuditTrail(auditTrail);

  if (errors.length > 0) {
    throw new ReportAssemblyError("Report audit trail assembly failed.", errors);
  }
}

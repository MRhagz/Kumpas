import { buildAuditTrail, validateAuditTrail } from "@/lib/report/audit-trail";
import { module3RecommendationProvider } from "@/lib/module3/recommendation-provider";
import type { RecommendationProvider } from "@/lib/report/provider";
import { buildStudentSummary } from "@/lib/report/reasoning-formatter";
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
  reportVersion?: number;
  approvedProfileVersion?: number;
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
  for (const version of [options.reportVersion, options.approvedProfileVersion]) {
    if (version !== undefined && (!Number.isSafeInteger(version) || version < 1)) {
      throw new ReportAssemblyError("Report version identity is invalid.");
    }
  }
  if (options.approvedProfileVersion !== undefined && rankedRecommendations.recommendations.some(
    (recommendation) => recommendation.approvedProfileVersion !== options.approvedProfileVersion,
  )) throw new ReportAssemblyError("Recommendations do not match the approved profile version.");
  // Guard titles too: the model may echo a note even when its explanation is safe.
  // A career name may legitimately match a reviewed goal or interest. Withhold
  // echoes of confidential context; never copy any of the five note fields.
  const noteValues = studentProfile.withheldNoteValues ?? studentProfile.concerns;
  const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const privatePhrases = noteValues.flatMap((value) => value.split(/[\n.!?;]+/)).map(normalize).filter(Boolean);
  const reportRecommendations = { ...rankedRecommendations, recommendations: rankedRecommendations.recommendations.map((recommendation, index) => ({
    ...recommendation,
    careerPath: privatePhrases.some((phrase) => ` ${normalize(recommendation.careerPath)} `.includes(` ${phrase} `))
      ? `Option ${index + 1} (title withheld; ask your counselor to review)` : recommendation.careerPath,
  })) };
  const auditTrail = buildAuditTrail(reportRecommendations);
  validateReportAuditTrail(auditTrail);

  return {
    sessionId,
    reportVersion: options.reportVersion ?? null,
    approvedProfileVersion: options.approvedProfileVersion ?? null,
    studentSummary: buildStudentSummary(reportRecommendations, academicEvidence),
    studentProfile,
    rankedRecommendations: reportRecommendations,
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

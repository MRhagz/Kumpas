import { demoRankedRecommendationList, demoStudentProfile } from "@/lib/report/fixtures";
import { demoAcademicEvidenceSummary } from "@/lib/report/fixtures";
import type {
  AcademicEvidenceSummary,
  RankedRecommendationList,
  StudentProfile,
} from "@/lib/report/types";
import {
  validateAcademicEvidenceSummary,
  validateRankedRecommendationList,
} from "@/lib/report/types";

export interface RecommendationProvider {
  getApprovedStudentProfile(sessionId: string): Promise<StudentProfile>;
  getRankedRecommendations(sessionId: string): Promise<RankedRecommendationList>;
  getAcademicEvidenceSummary(sessionId: string): Promise<AcademicEvidenceSummary>;
}

export const DEMO_REPORT_SESSION_ID = demoStudentProfile.sessionId;

function assertDemoSession(sessionId: string): void {
  if (sessionId !== DEMO_REPORT_SESSION_ID) {
    throw new Error(`No mock report data found for session: ${sessionId}`);
  }
}

function cloneFixture<T>(fixture: T): T {
  return structuredClone(fixture);
}

export async function getMockApprovedStudentProfile(
  sessionId: string,
): Promise<StudentProfile> {
  assertDemoSession(sessionId);
  return cloneFixture(demoStudentProfile);
}

export async function getMockRankedRecommendationList(
  sessionId: string,
): Promise<RankedRecommendationList> {
  assertDemoSession(sessionId);

  const recommendations = cloneFixture(demoRankedRecommendationList);
  const validationErrors = validateRankedRecommendationList(recommendations);

  if (validationErrors.length > 0) {
    throw new Error(
      `Mock ranked recommendations are invalid: ${validationErrors.join(" ")}`,
    );
  }

  return recommendations;
}

export async function getMockAcademicEvidenceSummary(
  sessionId: string,
): Promise<AcademicEvidenceSummary> {
  assertDemoSession(sessionId);
  const evidence = cloneFixture(demoAcademicEvidenceSummary);
  const validationErrors = validateAcademicEvidenceSummary(evidence);

  if (validationErrors.length > 0) {
    throw new Error(
      `Mock academic evidence is invalid: ${validationErrors.join(" ")}`,
    );
  }

  return evidence;
}

export const mockRecommendationProvider: RecommendationProvider = {
  getApprovedStudentProfile: getMockApprovedStudentProfile,
  getRankedRecommendations: getMockRankedRecommendationList,
  getAcademicEvidenceSummary: getMockAcademicEvidenceSummary,
};


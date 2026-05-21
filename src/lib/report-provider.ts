import { demoRankedRecommendationList, demoStudentProfile } from "@/lib/report-fixtures";
import type { RankedRecommendationList, StudentProfile } from "@/lib/report-types";
import { validateRankedRecommendationList } from "@/lib/report-types";

export interface RecommendationProvider {
  getApprovedStudentProfile(sessionId: string): Promise<StudentProfile>;
  getRankedRecommendations(sessionId: string): Promise<RankedRecommendationList>;
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

export const mockRecommendationProvider: RecommendationProvider = {
  getApprovedStudentProfile: getMockApprovedStudentProfile,
  getRankedRecommendations: getMockRankedRecommendationList,
};

import type {
  AcademicEvidenceSummary,
  RankedRecommendationList,
  StudentProfile,
} from "@/lib/report/types";

export interface RecommendationProvider {
  getApprovedStudentProfile(sessionId: string): Promise<StudentProfile>;
  getRankedRecommendations(sessionId: string): Promise<RankedRecommendationList>;
  getAcademicEvidenceSummary(sessionId: string): Promise<AcademicEvidenceSummary>;
}

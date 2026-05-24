import type {
  AcademicEvidenceSummary,
  RankedRecommendationList,
  StudentProfile,
} from "@/lib/report/types";
import {
  validateAcademicEvidenceSummary,
  validateRankedRecommendationList,
} from "@/lib/report/types";

export const demoStudentProfile: StudentProfile = {
  sessionId: "demo-session-module-4",
  displayName: "Demo Student",
  targetCareer: "Software Developer",
  interests: ["problem solving", "technology", "collaborative projects"],
  strengths: ["logical reasoning", "mathematics", "self-directed learning"],
  financialStatus: "constrained",
  concerns: ["tuition affordability", "need for local work opportunities"],
  approvedAt: "2026-05-21T12:00:00.000Z",
};

export const demoRankedRecommendationList: RankedRecommendationList = {
  sessionId: demoStudentProfile.sessionId,
  generatedAt: "2026-05-21T12:05:00.000Z",
  recommendations: [
    {
      id: "rec-software-developer",
      rank: 1,
      careerPath: "Software Developer",
      alignmentScore: 0.91,
      aptitudeFit: 0.94,
      marketDemand: 0.9,
      financialFeasibility: 0.86,
      reasoningSummary:
        "The student's technical interests and reasoning strengths align strongly with software development, while local and remote demand keep the path practical despite financial constraints.",
      keySignals: [
        "Strong logical reasoning and mathematics fit",
        "High demand for entry-level software roles",
        "Multiple lower-cost learning pathways are available",
      ],
      sources: [
        {
          id: "src-counselor-notes",
          title: "Counselor approved notes",
          reference: "session://demo-session-module-4/notes",
          acquisitionMethod: "counselor_notes",
          ingestionTimestamp: "2026-05-21T11:58:00.000Z",
          relatedSignals: ["technical interests", "student strengths"],
        },
        {
          id: "src-labor-software",
          title: "Labor analyst demand context",
          reference: "public/data/job-demand-analyst/demands_profiles.json",
          acquisitionMethod: "retrieved_context",
          ingestionTimestamp: "2026-05-21T12:01:00.000Z",
          relatedSignals: ["software role demand"],
        },
      ],
      status: "complete",
    },
    {
      id: "rec-data-analyst",
      rank: 2,
      careerPath: "Data Analyst",
      alignmentScore: 0.84,
      aptitudeFit: 0.88,
      marketDemand: 0.82,
      financialFeasibility: 0.81,
      reasoningSummary:
        "Data analysis is a strong adjacent option because it uses the student's quantitative strengths and can be entered through portfolio-based training, though communication skill development should be monitored.",
      keySignals: [
        "Quantitative strengths transfer well",
        "Portfolio projects can demonstrate readiness",
        "Communication expectations may require support",
      ],
      sources: [
        {
          id: "src-labor-data",
          title: "Skills and demand context",
          reference: "public/data/labor-analyst/r6_skills_and_demand_context.json",
          acquisitionMethod: "retrieved_context",
          ingestionTimestamp: "2026-05-21T12:02:00.000Z",
          relatedSignals: ["data skills", "market demand"],
        },
      ],
      status: "degraded",
      degradedReason: "Reasoning was generated from partial source coverage.",
    },
    {
      id: "rec-it-support-specialist",
      rank: 3,
      careerPath: "IT Support Specialist",
      alignmentScore: 0.78,
      aptitudeFit: 0.8,
      marketDemand: 0.76,
      financialFeasibility: 0.82,
      reasoningSummary:
        "IT support is a feasible near-term option because it has accessible certifications and practical entry points, but it may be less aligned with the student's long-term software development interests.",
      keySignals: [
        "Accessible certification route",
        "Lower initial education cost",
        "Less direct match with stated long-term goal",
      ],
      sources: [
        {
          id: "src-feasibility-certifications",
          title: "Program requirements context",
          reference: "public/data/feasibility-analyst/program-requirements.json",
          acquisitionMethod: "retrieved_context",
          ingestionTimestamp: "2026-05-21T12:03:00.000Z",
          relatedSignals: ["certification route", "education cost"],
        },
      ],
      status: "incomplete",
      incompleteReason: "One contributing analysis output was unavailable.",
    },
  ],
};

export const demoAcademicEvidenceSummary: AcademicEvidenceSummary = {
  availableDocuments: ["form137", "ncae"],
  missingDocuments: ["nat"],
  completenessNote:
    "NAT data was not available, so recommendations rely more heavily on Form 137 grades, NCAE aptitude signals, counselor notes, and labor-market context.",
};

export const demoRankedRecommendationValidationErrors =
  validateRankedRecommendationList(demoRankedRecommendationList);

export const demoAcademicEvidenceValidationErrors =
  validateAcademicEvidenceSummary(demoAcademicEvidenceSummary);


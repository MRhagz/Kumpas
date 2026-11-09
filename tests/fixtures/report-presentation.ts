import type {
  ReportGenerationResponse,
  ReportRecommendationSummary,
} from "../../src/lib/report/types";

export function reportFixture(scenario = "complete"): ReportGenerationResponse {
  const partial = scenario === "partial";
  const aptitudeText = partial
    ? "Aptitude comparison 82/100 uses self-reported interests (not measured academic performance)."
    : "Aptitude comparison 82/100 uses reviewed academic records.";
  const titles = [
    "BS Computer Science",
    "BS Information Systems",
    partial ? "Technical training" : "TESDA Programming NC IV",
  ];
  if (scenario === "long")
    titles[0] =
      "Extended technical and vocational pathway ".repeat(12) + "TITLE-END";
  const recommendations: ReportRecommendationSummary[] = titles.map(
    (careerPath, index) => {
      const unscored = partial && index === 2;
      return {
        id: `path-${index}`,
        rank: unscored ? null : index + 1,
        careerPath,
        alignmentScore: unscored ? null : 85 - index * 7.5,
        reasoningSummary:
          "Legacy explanation only used when structured claims are unavailable.",
        evidenceClaims: [
          {
            dimension: "aptitude",
            score: 82,
            text: aptitudeText,
            inputReferences: [
              partial
                ? "counselorNotes.interests"
                : "academicData.form137.subjects.Mathematics",
            ],
            sourceReferences: [],
          },
          {
            dimension: "demand",
            score: 90,
            text: "Demand comparison 90/100 uses public evidence [1].",
            inputReferences: [],
            sourceReferences: [
              {
                reference: "https://example.gov.ph/jobs?release=2026#evidence",
                chunkIndex: 2,
                siloId: "live_labor_demand",
              },
            ],
          },
          ...(unscored
            ? []
            : [
                {
                  dimension: "feasibility" as const,
                  score: 72,
                  text: "Feasibility comparison 72/100 uses reviewed context and public evidence [1].",
                  inputReferences: ["counselorNotes.financial"],
                  sourceReferences: [
                    {
                      reference:
                        "https://example.gov.ph/jobs?release=2026#evidence",
                      chunkIndex: 2,
                      siloId: "live_labor_demand",
                    },
                  ],
                },
              ]),
        ],
        keySignals: [],
        keySignalDetails: [
          {
            label: "Aptitude evidence",
            value: aptitudeText,
            polarity: "neutral",
          },
          {
            label: "Training costs",
            value: "Check equipment costs and available financial assistance.",
            polarity: "negative",
          },
        ],
        sources: [
          {
            id: "public-source",
            title: "Labor market outlook 2026",
            reference: "https://example.gov.ph/jobs?release=2026#evidence",
            sourceUrl: "https://example.gov.ph/jobs?release=2026#evidence",
            chunkIndex: 2,
            siloId: "live_labor_demand",
            acquisitionMethod: "operator_curated_pdf",
            publicationDate: "2026-10-01",
            ingestionTimestamp: "2026-11-01T00:00:00Z",
            relatedSignals: [],
          },
          {
            id: "local-source",
            title:
              scenario === "long"
                ? "Supporting reference ".repeat(30) + "SOURCE-END"
                : "Training pathways reference",
            reference: "file:///private/knowledge/training.pdf",
            sourceUrl: "javascript:alert(1)",
            acquisitionMethod: "manual_curation",
            publicationDate: null,
            ingestionTimestamp: null,
            relatedSignals: [],
          },
        ],
        ...(unscored
          ? {
              incompleteReason:
                "Feasibility evidence unavailable. No total or rank is assigned.",
            }
          : {}),
      };
    },
  );
  return {
    sessionId: "synthetic-report-preview",
    reportVersion: 2,
    approvedProfileVersion: 3,
    runId: "synthetic-run",
    reviewStatus: scenario === "rejected" ? "rejected" : "draft",
    previewUrl: scenario === "rejected" ? null : "/synthetic-preview.pdf",
    downloadUrl: null,
    generatedAt: "2026-11-10T08:00:00Z",
    expiresAt:
      scenario === "expired" ? "2020-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
    byteLength: 100,
    recommendations,
    recommendationCount: 3,
    academicEvidence: {
      availableDocuments: partial ? [] : ["form137", "ncae", "nat"],
      missingDocuments: partial ? ["form137", "ncae", "nat"] : [],
      completenessNote: partial
        ? "No usable academic records. Reviewed notes only."
        : "All three academic records are available.",
      ...(partial
        ? {
            documentStatuses: {
              form137: "absent",
              ncae: "unreadable",
              nat: "unsupported",
            },
          }
        : {}),
    },
    studentSummary: {
      disclosure:
        "AI-generated comparisons use counselor-confirmed inputs. Your counselor reviews the evidence and helps you decide.",
      scoreExplanation:
        "Scores compare aptitude, work opportunities and practical requirements. They are not probabilities of career success.",
      scope:
        "For Grade 10 and Senior High School guidance. Education stage is not confirmed.",
      options: recommendations.map((r) => ({
        id: r.id,
        careerPath: r.careerPath,
        rank: r.rank,
        alignmentScore: r.alignmentScore,
        reasons: [
          partial
            ? "Aptitude comparison: 82.00 out of 100, supported by self-reported interests (not measured academic performance)."
            : "Aptitude comparison: 82.00 out of 100, supported by reviewed academic records.",
          "Work-opportunity comparison: 90.00 out of 100, using the cited public evidence.",
          ...(r.rank === null
            ? []
            : [
                "Practical-requirements comparison: 72.00 out of 100, using reviewed context and cited evidence. Personal details are withheld.",
              ]),
        ],
        considerations: [
          r.rank === null
            ? "Evidence unavailable for practical requirements. This option is unscored and has no rank."
            : "Lowest component score: practical requirements (72/100). Discuss this trade-off.",
        ],
      })),
      limitations: [
        "Source currency is unverified. Check for newer information.",
        ...(partial
          ? [
              "No usable academic records are available. Reported interests are not measured academic performance.",
            ]
          : []),
      ],
      nextSteps: [
        "Discuss the options, their reasons and missing evidence with your counselor before choosing.",
        "Explore suitable tracks, further study, training or work options for your education stage.",
        "Check entry requirements, costs and financial support with the school or training provider.",
      ],
    },
  };
}

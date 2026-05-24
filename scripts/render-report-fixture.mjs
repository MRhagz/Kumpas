#!/usr/bin/env node
// Generates a sample PDF using the renderer with a payload that mirrors the
// original problem report (long career titles, file:// refs, duplicate
// interests/strengths, raw enum source method, 3+ sources). Run with:
//   npx tsx scripts/render-report-fixture.mjs

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderReportPdf } from "../src/lib/report/pdf-renderer.ts";

const longText =
  "The student is naturally gifted at logical puzzles and procedural reasoning, with a passion for math and creative writing.";

const payload = {
  sessionId: "9af2cfae-711d-4fde-a12a-29c52592859b",
  generatedAt: "2026-05-24T08:00:00.000Z",
  studentProfile: {
    sessionId: "9af2cfae-711d-4fde-a12a-29c52592859b",
    targetCareer:
      "The student currently wants to pursue BS Computer Science with a Game Development specialization.",
    interests: [longText],
    strengths: [longText],
    financialStatus: "constrained",
    concerns: [],
    approvedAt: "2026-05-24T07:30:00.000Z",
  },
  academicEvidence: {
    availableDocuments: [],
    missingDocuments: ["form137", "ncae", "nat"],
    completenessNote:
      "No academic documents were provided. Recommendations are based on counselor notes only.",
  },
  rankedRecommendations: {
    sessionId: "9af2cfae-711d-4fde-a12a-29c52592859b",
    generatedAt: "2026-05-24T07:55:00.000Z",
    recommendations: [
      makeRec({
        id: "rec-1",
        rank: 1,
        careerPath:
          "BS Computer Science (General Software Engineering/Specialized IT)",
        scores: [0.87, 0.85, 0.98, 0.7],
        sources: [
          {
            id: "src-a",
            title: "PSA LFS 2026-Q1: Services and Sales Workers",
            reference: "file:///home/milleza/projects/Kumpas/ingestion/psa-lfs-2026-q1-services.csv",
            acquisitionMethod: "operator_curated_csv",
            ingestionTimestamp: "2026-05-23T08:00:00.000Z",
            relatedSignals: [],
          },
          {
            id: "src-b",
            title: "PSA LFS 2026-Q1: Professionals",
            reference: "file:///home/milleza/projects/Kumpas/ingestion/psa-lfs-2026-q1-professionals.csv",
            acquisitionMethod: "operator_curated_csv",
            ingestionTimestamp: "2026-05-23T08:00:00.000Z",
            relatedSignals: [],
          },
          {
            id: "src-c",
            title: "DOLE BLE Labor Market Information 2025-Q4",
            reference: "https://ble.dole.gov.ph/wp-content/uploads/2025/lmi-2025-q4.pdf",
            acquisitionMethod: "operator_curated_pdf",
            ingestionTimestamp: "2026-05-23T08:00:00.000Z",
            relatedSignals: [],
          },
        ],
      }),
      makeRec({
        id: "rec-2",
        rank: 2,
        careerPath: "BS Computer Science (Game Development Specialization)",
        scores: [0.85, 0.9, 0.95, 0.6],
      }),
      makeRec({
        id: "rec-3",
        rank: 3,
        careerPath: "TESDA-Certified Programming/IT Specialist",
        scores: [0.79, 0.8, 0.75, 0.85],
        sources: [
          {
            id: "src-d",
            title: "PSA LFS 2026-Q1: Technicians and Associate Professionals",
            reference: "file:///home/milleza/projects/Kumpas/ingestion/psa-lfs-2026-q1-tech.csv",
            acquisitionMethod: "operator_curated_csv",
            ingestionTimestamp: "2026-05-23T08:00:00.000Z",
            relatedSignals: [],
          },
          {
            id: "src-e",
            title: "DOLE BLE Labor Market Information Report",
            reference: "https://ble.dole.gov.ph/wp-content/uploads/2025/lmi-tech-2025.pdf",
            acquisitionMethod: "operator_curated_pdf",
            ingestionTimestamp: "2026-05-23T08:00:00.000Z",
            relatedSignals: [],
          },
        ],
      }),
    ],
  },
  auditTrail: [],
};

payload.auditTrail = payload.rankedRecommendations.recommendations.map((rec) => ({
  recommendationId: rec.id,
  careerPath: rec.careerPath,
  sources: rec.sources,
}));

function makeRec({ id, rank, careerPath, scores, sources }) {
  const [alignmentScore, aptitudeFit, marketDemand, financialFeasibility] = scores;
  return {
    id,
    rank,
    careerPath,
    alignmentScore,
    aptitudeFit,
    marketDemand,
    financialFeasibility,
    reasoningSummary:
      "This career path is ranked highest because it's a strong match for your skills and offers many exciting job opportunities, even with some financial considerations.",
    keySignals: [
      "Strong logical reasoning",
      "Exceptional demand for IT professionals",
    ],
    keySignalDetails: [
      {
        label: "Academic Fit",
        value: "Strong fit with logical, mathematical, and programming abilities.",
        subNote: "Provides a solid foundation for diverse tech specializations.",
        polarity: "positive",
      },
      {
        label: "Labor Demand",
        value: "Exceptional demand for general and specialized IT professionals.",
        subNote: "Roles like Data, DevOps, and Cloud Engineers are on the rise.",
        polarity: "positive",
      },
      {
        label: "Financial Barrier",
        value: "Requires investment in computing hardware not fully covered.",
        subNote: "Remains a significant personal expense.",
        polarity: "negative",
      },
      {
        label: "Academic Risk",
        value: "Potential struggle with advanced theoretical math.",
        subNote: "Maintaining academic standing is crucial for scholarships.",
        polarity: "negative",
      },
    ],
    sources: sources ?? [
      {
        id: `${id}-src-default`,
        title: "PSA LFS 2026-Q1: Services and Sales Workers",
        reference: "file:///home/milleza/projects/Kumpas/ingestion/psa-lfs-2026-q1-services.csv",
        acquisitionMethod: "operator_curated_csv",
        ingestionTimestamp: "2026-05-23T08:00:00.000Z",
        relatedSignals: [],
      },
      {
        id: `${id}-src-default-2`,
        title: "PSA LFS 2026-Q1: Professionals",
        reference: "file:///home/milleza/projects/Kumpas/ingestion/psa-lfs-2026-q1-professionals.csv",
        acquisitionMethod: "operator_curated_csv",
        ingestionTimestamp: "2026-05-23T08:00:00.000Z",
        relatedSignals: [],
      },
    ],
    status: "complete",
  };
}

const buffer = await renderReportPdf(payload);
const outPath = resolve("test/sample_report_refined.pdf");
writeFileSync(outPath, buffer);
console.log(`Wrote ${outPath} (${buffer.byteLength} bytes)`);

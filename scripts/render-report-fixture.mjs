#!/usr/bin/env bun
// Reproducible, entirely synthetic report; no student information or live calls.
// Run: bun scripts/render-report-fixture.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReportPdf } from "../src/lib/report/pdf-renderer.ts";
import { buildStudentSummary } from "../src/lib/report/reasoning-formatter.ts";
import { evidenceClaims, summaryText } from "../src/lib/report/evidence-summary.ts";

const generatedAt = "2026-11-10T08:00:00Z";
const sessionId = "synthetic-career-guidance-sample";
const documents = [
  { title: "Synthetic employment outlook — ICT pathways", publisher: "Kumpas demonstration fixture", url: "https://example.org/synthetic-employment-outlook", siloId: "labor_demand" },
  { title: "Synthetic programme requirements and support guide", publisher: "Kumpas demonstration fixture", url: "https://example.org/synthetic-training-guide", siloId: "path_feasibility" },
];
const recommendations = [
  { careerPath: "Software development", scores: [85, 90, 75], input: "academicData.nat.subjects.Mathematics" },
  { careerPath: "Applied ICT", scores: [80, 75, 98], input: "academicData.ncae.strand_scores.ICT" },
  { careerPath: "Computer systems servicing", scores: [72, 78, 88], input: "academicData.form137.subjects.Technology" },
].map(({ careerPath, scores: [aptitudeFit, marketDemand, financialFeasibility], input }, index) => {
  const sources = documents.map((document, sourceIndex) => ({
    id: `sample-${index + 1}-source-${sourceIndex + 1}`, title: document.title, publisher: document.publisher,
    reference: document.url, sourceUrl: document.url, siloId: document.siloId, chunkIndex: index,
    publicationDate: "2026-10-01", ingestionTimestamp: "2026-11-01T00:00:00Z", acquisitionMethod: "manual_curation", relatedSignals: [],
  }));
  const citation = (sourceIndex) => ({ reference: sources[sourceIndex].reference, chunkIndex: index, siloId: sources[sourceIndex].siloId });
  const componentEvidence = {
    aptitude: { inputReferences: [input], sourceReferences: [], explanation: "Synthetic evidence mapping." },
    demand: { inputReferences: [], sourceReferences: [citation(0)], explanation: "Synthetic evidence mapping." },
    feasibility: { inputReferences: ["counselorNotes.financial"], sourceReferences: [citation(1)], explanation: "Synthetic evidence mapping." },
  };
  return {
    id: `sample-path-${index + 1}`, careerPath, rank: index + 1,
    alignmentScore: Math.round((35 * aptitudeFit + 40 * marketDemand + 25 * financialFeasibility)) / 100,
    aptitudeFit, marketDemand, financialFeasibility, componentEvidence, sources,
    reasoningSummary: summaryText(evidenceClaims({ componentEvidence, aptitudeScore: aptitudeFit, demandScore: marketDemand, feasibilityScore: financialFeasibility, sourceReferences: sources })),
    weights: { aptitude: 0.35, demand: 0.4, feasibility: 0.25 }, approvedProfileVersion: 1,
    status: "complete", keySignals: [], keySignalDetails: [],
  };
});
const rankedRecommendations = { sessionId, generatedAt, recommendations, scoreContract: "0-100-v1" };
const academicEvidence = {
  availableDocuments: ["form137", "ncae", "nat"], missingDocuments: [],
  documentStatuses: { form137: "provided", ncae: "provided", nat: "provided" },
  completenessNote: "Synthetic academic records are available for this demonstration.",
};
const payload = {
  sessionId, generatedAt, reportVersion: 1, approvedProfileVersion: 1,
  studentProfile: { sessionId, interests: ["Synthetic ICT interest"], strengths: ["Synthetic academic input"], financialStatus: "unknown", concerns: [], approvedAt: generatedAt },
  rankedRecommendations, academicEvidence, studentSummary: buildStudentSummary(rankedRecommendations, academicEvidence),
  auditTrail: recommendations.map((recommendation) => ({ recommendationId: recommendation.id, careerPath: recommendation.careerPath, sources: recommendation.sources })),
};
payload.studentSummary.findings.unshift("LAYOUT DEMONSTRATION ONLY: All scores and references in this sample are synthetic. They are not findings about a student or verified career evidence.");
const directory = resolve("test-results");
mkdirSync(directory, { recursive: true });
const path = resolve(directory, "kumpas-career-guidance-sample-v2.pdf");
const pdf = buildReportPdf(payload);
writeFileSync(path, pdf);
console.log(`Wrote ${path} (${pdf.length} bytes). All scores and sources are synthetic.`);

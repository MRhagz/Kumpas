import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildReportPdf } from "@/lib/report/pdf-renderer";
import { reportPdfText } from "./report-pdf-text";
import { validateRankedRecommendationList } from "@/lib/report/types";
import type { RankedRecommendation, ReportPayload } from "@/lib/report/types";
import ReportDownloadView from "@/components/analysis/report-download-view";
import { alignmentScoreCalculator } from "@/lib/module3/alignment-score-calculator";

function recommendation(name: string, partial = false): RankedRecommendation {
  return { id: name, rank: partial ? null : 1, careerPath: name, alignmentScore: partial ? null : 74.5,
    aptitudeFit: 80, marketDemand: 60, financialFeasibility: partial ? null : 90,
    reasoningSummary: "Based on approved academic evidence, current labor demand, and available financial context.",
    keySignals: ["Mathematics supports this option"], keySignalDetails: [],
    sources: [{ id: "source", title: "Synthetic public source", reference: "https://example.gov.ph/evidence", acquisitionMethod: "automated_pdf", ingestionTimestamp: "2026-11-01T00:00:00Z", relatedSignals: [] }],
    status: partial ? "incomplete" : "complete", incompleteReason: partial ? "Unscored partial comparison: missing feasibility." : undefined };
}
const recommendations = [recommendation("Alpha"), recommendation("Beta"), recommendation("Partial", true)];
const payload: ReportPayload = {
  sessionId: "synthetic-session", generatedAt: "2026-11-05T00:00:00Z",
  studentProfile: { sessionId: "synthetic-session", interests: ["Mathematics"], strengths: ["Logical reasoning"], financialStatus: "constrained", concerns: [], approvedAt: "2026-11-05T00:00:00Z" },
  rankedRecommendations: { sessionId: "synthetic-session", generatedAt: "2026-11-05T00:00:00Z", recommendations },
  academicEvidence: { availableDocuments: ["nat"], missingDocuments: ["form137", "ncae"], completenessNote: "Only NAT was provided." },
  auditTrail: recommendations.map((r) => ({ recommendationId: r.id, careerPath: r.careerPath, sources: r.sources })),
};

it("DEF-005/007 preserves the three historical totals through calculation, UI and PDF disclosure", async () => {
  const scored = alignmentScoreCalculator.calculate({ candidates: [[85, 90, 75], [80, 88, 65], [75, 82, 50]].map(([a, d, f], index) => ({
    careerPath: `Historical option ${index + 1}`, aptitudeScore: a, demandScore: d, feasibilityScore: f,
    componentEvidence: { aptitude: null, demand: null, feasibility: null }, signals: [], keySignalDetails: [], sourceReferences: [],
  })) });
  const paths = scored.map(path => ({ ...recommendation(path.careerPath), rank: path.rank, alignmentScore: path.alignmentScore,
    aptitudeFit: path.aptitudeScore, marketDemand: path.demandScore, financialFeasibility: path.feasibilityScore, sources: [] }));
  const historical = { ...payload, rankedRecommendations: { ...payload.rankedRecommendations, recommendations: paths },
    auditTrail: paths.map(path => ({ recommendationId: path.id, careerPath: path.careerPath, sources: [] })) };
  const pdf = await reportPdfText(buildReportPdf(historical));
  const html = renderToStaticMarkup(createElement(ReportDownloadView, { report: { ...historical, reportVersion: 1,
    downloadUrl: null, expiresAt: "2099-01-01T00:00:00Z", byteLength: 1, recommendationCount: paths.length, recommendations: paths }, onNewSession: () => {} }));
  for (const score of ["84.50", "79.45", "71.55"]) { expect(pdf).toContain(score); expect(html).toContain(`aria-valuetext="${score} points out of 100"`); }
  expect(pdf).toContain("overall scores are 5.05 points apart");
  expect(pdf).toContain("AI"); expect(html).toContain("AI");
  expect(pdf).toContain("not probabilities"); expect(html).toContain("not probabilities");
  expect(pdf).not.toContain("1970");
});

it("accepts fewer paths, ties and partial comparisons; rejects false scored partials and wrong ordering", () => {
  const list = payload.rankedRecommendations;
  expect(validateRankedRecommendationList(list)).toEqual([]);
  expect(validateRankedRecommendationList({ ...list, recommendations: recommendations.slice(0, 1) })).toEqual([]);
  expect(validateRankedRecommendationList({ ...list, recommendations: [] })).toContain("Insufficient evidence for a report.");
  expect(validateRankedRecommendationList({ ...list, recommendations: [{ ...recommendations[2], alignmentScore: 74.5 }] }).join(" ")).toContain("unscored partial");
  expect(validateRankedRecommendationList({ ...list, recommendations: [recommendations[1], recommendations[0]] }).join(" ")).toContain("alphabetical");
});

it("renders exact scores and clearly unscored partial comparisons in the report UI", () => {
  const html = renderToStaticMarkup(createElement(ReportDownloadView, {
    report: { ...payload, reportVersion: 1, downloadUrl: "/synthetic.pdf", expiresAt: "2099-01-01T00:00:00Z", byteLength: 1,
      recommendationCount: recommendations.length, recommendations }, onNewSession: () => {},
  }));
  expect(html).toContain('aria-valuetext="74.50 points out of 100"'); expect(html).not.toContain("7450");
  expect(html).toContain("Unscored partial comparisons"); expect(html).toContain("Unscored");
  expect(html).toContain("Fewer than three scored paths");
});

it("renders two-decimal PDF scores, shared ranks, unavailable components and the separate partial heading", async () => {
  const pdf = buildReportPdf(payload);
  const text = await reportPdfText(pdf);
  expect(text).toContain("74.50"); expect(text).not.toContain("7450");
  expect(text).toContain("Unavailable"); expect(text).toContain("Unscored partial comparisons");
  expect(text).not.toContain("Recommendation null");
  if (process.env.SW16_PDF_QA_DIR) {
    mkdirSync(process.env.SW16_PDF_QA_DIR, { recursive: true });
    writeFileSync(`${process.env.SW16_PDF_QA_DIR}/alignment-scoring.pdf`, pdf);
  }
});

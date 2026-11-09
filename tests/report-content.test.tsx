import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { ApprovedProfile } from "@/types";
import type { RankedRecommendation, RankedRecommendationList, ReportGenerationResponse } from "@/lib/report/types";

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
import { assembleReportData } from "@/lib/report/assembler";
import { runRecommendationProvider } from "@/lib/module3/recommendation-provider";
import { evidenceClaims, summaryText } from "@/lib/report/evidence-summary";
import { buildReportPdf } from "@/lib/report/pdf-renderer";
import { reportContentMarker } from "@/lib/report/types";
import ReportDownloadView from "@/components/analysis/report-download-view";

const PRIVATE = "PRIVATE-NOTE-ALPHA";
const RAW = "RAW-REASONING-ALPHA";
const generatedAt = "2026-11-07T08:00:00Z";
const completeCases = [
  ["Grade 10 science", "Science and technology track"],
  ["Grade 10 business", "Business studies track"],
  ["Grade 10 arts", "Arts and design track"],
  ["Grade 10 technical", "Technical and vocational track"],
  ["Grade 10 humanities", "Humanities and social sciences track"],
  ["SHS science", "Engineering studies"],
  ["SHS business", "Business administration studies"],
  ["SHS arts", "Design studies"],
  ["SHS technical", "Technical training"],
  ["SHS work", "Workforce pathway exploration"],
] as const;

function fixture(title: string, partial = false, notesOnly = false, sourceCount = 2) {
  const profile: ApprovedProfile = {
    sessionId: "sw19-synthetic", sessionTimestamp: generatedAt, profileVersion: 7,
    counselorNotes: { careerGoal: `${PRIVATE}-GOAL`, interests: `${PRIVATE}-INTERESTS`, financial: `${PRIVATE}-FINANCIAL`, concerns: `${PRIVATE}-CONCERNS`, impression: `${PRIVATE}-IMPRESSION` },
    academicData: notesOnly ? {} : {
      form137: { subjects: [{ name: "Mathematics", grade: 80, year: "2025", grade_level: "Grade 9" }] },
      ncae: { strand_scores: { STEM: 80 } }, nat: { subjects: { Mathematics: 80 } },
    },
  };
  const recommendations: RankedRecommendation[] = ["Alpha", "Beta", "Gamma"].map((prefix) => {
    const sources = Array.from({ length: sourceCount }, (_, index) => ({
      id: `source-${index}`, title: `Synthetic reference ${index + 1}`,
      reference: `https://example.gov.ph/reference/${index}?release=2026#evidence`,
      sourceUrl: `https://example.gov.ph/reference/${index}?release=2026#evidence`,
      siloId: index ? "path_feasibility" : "labor_demand", chunkIndex: index,
      acquisitionMethod: "operator_curated_pdf" as const,
      publicationDate: "2026-10-01", ingestionTimestamp: "2026-11-01T00:00:00Z", relatedSignals: [RAW],
    }));
    const componentEvidence = {
      aptitude: { inputReferences: [notesOnly ? "counselorNotes.interests" : "academicData.nat.subjects.Mathematics"], sourceReferences: [], explanation: RAW },
      demand: { inputReferences: [], sourceReferences: [{ reference: sources[0].reference, chunkIndex: 0, siloId: sources[0].siloId }], explanation: RAW },
      feasibility: partial ? null : { inputReferences: ["counselorNotes.financial"], sourceReferences: [{ reference: sources[1].reference, chunkIndex: 1, siloId: sources[1].siloId }], explanation: RAW },
    };
    return {
      id: prefix, careerPath: `${prefix} ${title}`, rank: partial ? null : 1, alignmentScore: partial ? null : 74.5,
      aptitudeFit: 80, marketDemand: 60, financialFeasibility: partial ? null : 90,
      componentEvidence, approvedProfileVersion: 7, weights: { aptitude: 0.35, demand: 0.4, feasibility: 0.25 },
      reasoningSummary: summaryText(evidenceClaims({ componentEvidence, aptitudeScore: 80, demandScore: 60, feasibilityScore: partial ? null : 90, sourceReferences: sources })),
      keySignals: [RAW], keySignalDetails: [{ label: RAW, value: PRIVATE, polarity: "neutral" }], sources,
      status: partial ? "incomplete" : "complete", incompleteReason: partial ? "Missing feasibility evidence." : undefined,
    };
  });
  const list: RankedRecommendationList = { sessionId: profile.sessionId, generatedAt, scoreContract: "0-100-v1", recommendations };
  return { profile, list };
}

async function renderFixture(input: ReturnType<typeof fixture>) {
  const payload = await assembleReportData(input.profile.sessionId, {
    provider: runRecommendationProvider(input.profile, input.list), reportVersion: 3, approvedProfileVersion: 7, generatedAt,
  });
  const pdf = buildReportPdf(payload);
  const report: ReportGenerationResponse = {
    sessionId: payload.sessionId, reportVersion: 3, approvedProfileVersion: 7, reviewStatus: "draft",
    studentSummary: payload.studentSummary, generatedAt, expiresAt: "2099-01-01T00:00:00Z", downloadUrl: null,
    byteLength: pdf.length, recommendationCount: input.list.recommendations.length,
    academicEvidence: payload.academicEvidence, recommendations: payload.rankedRecommendations.recommendations,
  };
  const html = renderToStaticMarkup(createElement(ReportDownloadView, { report, onNewSession: () => {} }));
  // Parse the actual PDF, rather than searching its drawing commands alone.
  const { getDocument } = await import("academic-pdfjs/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(pdf), standardFontDataUrl: join(process.cwd(), "node_modules/academic-pdfjs/standard_fonts").replaceAll("\\", "/") + "/" });
  const pages: string[] = [];
  try {
    const document = await task.promise;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const { items } = await page.getTextContent();
      const text = items.filter((item) => "str" in item);
      pages.push(text.map((item) => item.str).join(" "));
      for (const item of text) {
        const [x, y] = item.transform.slice(4);
        expect(x, `page ${number}: ${item.str}`).toBeGreaterThanOrEqual(37);
        expect(x + item.width, `page ${number}: ${item.str}`).toBeLessThanOrEqual(558);
        expect(y, `page ${number}: ${item.str}`).toBeLessThanOrEqual(805);
        expect(y, `page ${number}: ${item.str}`).toBeGreaterThanOrEqual(y < 28 ? 15 : 38);
      }
      page.cleanup();
    }
  } finally { await task.destroy(); }
  const counselorPage = pages.findIndex((page) => page.includes("COUNSELOR DETAIL"));
  expect(counselorPage).toBeGreaterThan(0);
  const studentText = pages.slice(0, counselorPage).join(" ");
  const studentHtml = html.slice(html.indexOf('<section aria-labelledby="student-summary-heading"'), html.indexOf("<details"));
  for (const output of [JSON.stringify(payload.studentSummary), studentText, studentHtml]) {
    expect(output).not.toContain(PRIVATE);
    expect(output).not.toContain(RAW);
    expect(output).toContain("AI-generated comparisons");
    expect(output).toContain("not probabilities of career success");
    expect(output).toContain("Discuss the options");
  }
  expect(pages[0]).toContain("Report version: 3. Approved profile version: 7.");
  expect(pages.every((page) => page.includes("Generated as Draft"))).toBe(true);
  expect(pdf.toString("utf8").startsWith(`%PDF-1.4\n${reportContentMarker(3, 7)}`)).toBe(true);
  expect(html).toContain("Report version: 3. Approved profile version: 7.");
  expect(html).not.toContain("signed PDF");
  expect(pages.join(" ")).not.toContain(PRIVATE);
  return { payload, pdf, html, studentText, studentHtml, pages };
}

function saveQa(name: string, result: Awaited<ReturnType<typeof renderFixture>>) {
  const directory = process.env.SW19_PDF_QA_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${name}.pdf`), result.pdf);
  writeFileSync(join(directory, `${name}.html`), result.html);
  writeFileSync(join(directory, `${name}.txt`), result.pages.join("\n\f\n"));
}

it.each(completeCases)("F11 / FR-015 complete report: %s", async (scenario, title) => {
  const result = await renderFixture(fixture(title));
  expect(result.studentText).toContain("74.50 out of 100");
  expect(result.studentText).not.toContain("74.50%");
  expect(result.studentText).toContain("Rank 1");
  expect(result.payload.studentSummary?.options.map((option) => option.careerPath)).toEqual([`Alpha ${title}`, `Beta ${title}`, `Gamma ${title}`]);
  expect(result.pages.join(" ")).toContain("Applied weights: aptitude 0.35, demand 0.4, feasibility 0.25.");
  expect(result.html).toContain("release=2026#evidence");
  if (scenario === "Grade 10 science") saveQa("complete", result);
});

it("F11 renders partial, fewer-path and missing-date evidence without inventing scores", async () => {
  const input = fixture("Technical training", true);
  input.profile.academicData = { form137: input.profile.academicData.form137! };
  input.list.recommendations = input.list.recommendations.slice(0, 1);
  for (const source of input.list.recommendations[0].sources) {
    source.publicationDate = null; source.ingestionTimestamp = null;
  }
  const result = await renderFixture(input);
  expect(result.payload.studentSummary?.options[0]).toMatchObject({ rank: null, alignmentScore: null });
  expect(result.studentText).toContain("Fewer than three scored paths");
  expect(result.studentText).toContain("National Achievement Test");
  expect(result.pages.join(" ")).toContain("Publication date unavailable");
  expect(result.pages.join(" ")).toContain("Ingestion date unavailable");
  expect(result.studentText).toContain("No total or rank");
  saveQa("partial", result);
});

it("puts the evidence decision before the options in a notes-only report", async () => {
  const input = fixture("Career exploration", true, true);
  const paths = ["Electronics / Electrical Technician", "Mechanical Engineer", "Software Engineer"];
  input.list.recommendations.forEach((option, index) => { option.careerPath = paths[index]; });
  const result = await renderFixture(input);
  const cover = result.pages[0];

  expect(cover).toContain("Explore options before ranking them");
  expect(cover.indexOf("Explore options before ranking them")).toBeLessThan(cover.indexOf(paths[0]));
  expect(cover).toContain("Review the evidence gaps with the student");
  expect(cover).toContain("No total or rank");
  expect(result.studentText).not.toContain("Alignment score:");
  expect(result.studentText).toContain("No usable academic records are available");
  expect(result.studentText).toContain("not probabilities of career success");
  saveQa("counselor-discussion-sample", result);
});

it("F11 keeps notes-only evidence self-reported and withholds an echoed confidential option title", async () => {
  const input = fixture(`${PRIVATE}-FINANCIAL training`, true, true);
  const result = await renderFixture(input);
  expect(result.studentText).toContain("not measured academic performance");
  expect(result.studentText).not.toContain("reviewed academic records");
  expect(result.payload.studentSummary?.options.every((option) => option.careerPath.includes("title withheld"))).toBe(true);
  saveQa("notes-only", result);
});

it("F11 withholds legacy explanation prose rather than rewriting it as established evidence", async () => {
  const input = fixture("Engineering studies");
  for (const option of input.list.recommendations) option.reasoningSummary = RAW;
  const result = await renderFixture(input);
  expect(result.studentText).toContain("Evidence summary unavailable");
  expect(result.payload.studentSummary?.options[0].reasons).toHaveLength(1);
});

it("F11 identifies unavailable public sources in an aptitude-only comparison", async () => {
  const input = fixture("Training exploration", true, true);
  input.list.recommendations = input.list.recommendations.slice(0, 1);
  const option = input.list.recommendations[0];
  option.marketDemand = null;
  option.componentEvidence!.demand = null;
  option.sources = [];
  option.reasoningSummary = summaryText(evidenceClaims({
    componentEvidence: option.componentEvidence!, aptitudeScore: 80, demandScore: null, feasibilityScore: null, sourceReferences: [],
  }));
  const result = await renderFixture(input);
  expect(result.studentText).toContain("No supporting reference sources are available");
  expect(result.studentText).not.toContain("using the cited public evidence");
});

it("F11 preserves a supported career name that matches the reviewed goal or interest", async () => {
  const input = fixture("Engineering studies");
  input.profile.counselorNotes.careerGoal = "Engineering studies";
  input.profile.counselorNotes.interests = "Engineering";
  const result = await renderFixture(input);
  expect(result.payload.studentSummary?.options[0].careerPath).toBe("Alpha Engineering studies");
});

it("F11 paginates long titles and multi-page references without clipping or dropping the end", async () => {
  const title = `${"Extended technical and vocational pathway ".repeat(12)}TITLE-END`;
  const input = fixture(title, false, false, 18);
  for (const option of input.list.recommendations) {
    option.sources[17].title = `${"Public source title ".repeat(20)}SOURCE-END`;
    option.sources[17].sourceUrl = `https://example.gov.ph/${"longpath".repeat(35)}?release=2026#URL-END`;
  }
  const result = await renderFixture(input);
  expect(result.studentText.match(/TITLE-END/g)).toHaveLength(3);
  expect(result.pages.join(" ").match(/SOURCE-END/g)).toHaveLength(3);
  expect(result.pages.join(" ").replace(/\s/g, "")).toContain("#URL-END");
  saveQa("long-content", result);
});

it("F11 distinguishes unreadable and unsupported records from absent records in UI and PDF", async () => {
  const input = fixture("Technical training", true, true);
  input.profile.inputEvidence = {
    notes: { revision: 1, source: null },
    documents: [
      { documentId: "ncae", documentType: "ncae", revision: 1, status: "unreadable", source: {} },
      { documentId: "nat", documentType: "nat", revision: 1, status: "unsupported", source: {} },
    ],
  };
  const result = await renderFixture(input);
  expect(result.payload.academicEvidence.documentStatuses).toEqual({ form137: "absent", ncae: "unreadable", nat: "unsupported" });
  expect(result.studentText).toContain("was unreadable");
  expect(result.studentText).toContain("was unsupported");
  expect(result.html).toContain("NCAE: unreadable");
  expect(result.html).toContain("NAT: unsupported");
  expect(result.pages.join(" ")).toContain("National Career Assessment Examination (NCAE): unreadable");
});

it("refuses an insufficient-evidence report before rendering", async () => {
  const input = fixture("No supported options");
  input.list.recommendations = [];
  await expect(assembleReportData(input.profile.sessionId, { provider: runRecommendationProvider(input.profile, input.list), reportVersion: 3, approvedProfileVersion: 7 }))
    .rejects.toThrow("Report data assembly failed");
});

it("refuses a report assembled from a different approved profile version", async () => {
  const input = fixture("Engineering studies");
  await expect(assembleReportData(input.profile.sessionId, { provider: runRecommendationProvider(input.profile, input.list), reportVersion: 3, approvedProfileVersion: 8 }))
    .rejects.toThrow("Recommendations do not match");
});

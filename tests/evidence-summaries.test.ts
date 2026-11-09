import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import type { ApprovedProfile } from "@/types";
import type { AgentOutput, CandidateCareerPath } from "@/lib/module3/types";
const m = vi.hoisted(() => ({ generate: vi.fn(), rows: [] as Record<string, unknown>[], sources: [] as Record<string, unknown>[] }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: m.generate }; } }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: (table: string) => ({
  delete: () => ({ eq: async () => ({ error: null }) }),
  insert: async (rows: Record<string, unknown>[]) => { if (table === "recommendation_sources") m.sources = rows; else m.rows = rows; return { error: null }; },
}) } }));
import { synthesisInterpreter } from "@/lib/module3/synthesis-interpreter";
import { alignmentScoreCalculator } from "@/lib/module3/alignment-score-calculator";
import { rankingAgent } from "@/lib/module3/ranking-agent";
import { rankedRecommendationBuilder } from "@/lib/module3/ranked-recommendation-builder";
import { runRecommendationProvider } from "@/lib/module3/recommendation-provider";
import { assembleReportData } from "@/lib/report/assembler";
import { buildReportPdf } from "@/lib/report/pdf-renderer";
import { reportPdfText } from "./report-pdf-text";
import { formatReasoningSummary } from "@/lib/report/reasoning-formatter";
import { buildAuditTrail } from "@/lib/report/audit-trail";
import { sourceDate, publicSourceUrl } from "@/lib/report/evidence-summary";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ReportDownloadView from "@/components/analysis/report-download-view";

const PRIVATE = "CONFIDENTIAL_COUNSELOR_NOTE_SENTINEL";
const RAW = "RAW_INTERNAL_REASONING_SENTINEL";
const profile: ApprovedProfile = { sessionId: "synthetic", sessionTimestamp: "2026-11-07T00:00:00Z",
  academicData: { nat: { subjects: { Mathematics: 80 } } },
  counselorNotes: { careerGoal: "Undecided", interests: "Mathematics", financial: PRIVATE, concerns: PRIVATE, impression: PRIVATE } };
const outputs: AgentOutput[] = ["AcademicAuditor", "IndustryAnalyst", "FeasibilityStrategist"].map((name) => ({
  agentName: name as AgentOutput["agentName"], status: "SUCCESS", analysis: JSON.stringify({ summary: `${PRIVATE} ${RAW}` }),
  retrievedChunks: [{ silo_id: "synthetic", source_type: name, source_url: `https://example.gov.ph/${name}?release=2026#evidence`,
    official_source_url: `https://example.gov.ph/${name}?release=2026#evidence`, chunk_index: 2,
    content: "Synthetic public record: demand has both opportunities and constraints.", source_metadata: { title: `Public ${name}` },
    acquisition_method: "automated_pdf", ingestion_timestamp: "2026-11-01T00:00:00Z", publication_date: "2026-10-01",
    similarity: 1, embedding_model: "synthetic", embedding_dimensions: 768 }],
}));
function candidate(a: number | null, d: number | null, f: number | null, notesOnly = false): CandidateCareerPath {
  return { careerPath: "Synthetic supported option", aptitudeScore: a, demandScore: d, feasibilityScore: f,
    signals: [PRIVATE, RAW], keySignalDetails: [{ label: RAW, value: PRIVATE, polarity: "positive" }], sourceReferences: [],
    componentEvidence: {
      aptitude: a === null ? null : { inputReferences: [notesOnly ? "counselorNotes.interests" : "academicData.nat.subjects.Mathematics"], sourceReferences: [], explanation: `${PRIVATE} ${RAW}` },
      demand: d === null ? null : { inputReferences: [], sourceReferences: [{ reference: outputs[1].retrievedChunks[0].source_url, chunkIndex: 2 }], explanation: RAW },
      feasibility: f === null ? null : { inputReferences: ["counselorNotes.financial"], sourceReferences: [{ reference: outputs[2].retrievedChunks[0].source_url, chunkIndex: 2 }], explanation: PRIVATE },
    } };
}
const cases = [
  ["balanced", 80, 60, 90, false], ["aptitude-led", 95, 40, 50, false], ["demand-led", 40, 95, 50, false], ["feasibility-led", 40, 50, 95, false],
  ["equal", 70, 70, 70, false], ["zero", 0, 0, 0, false], ["maximum", 100, 100, 100, false], ["decimal", 84.5, 79.45, 71.55, false],
  ["missing-aptitude", null, 60, 90, false], ["missing-demand", 80, null, 90, false], ["missing-feasibility", 80, 60, null, false],
  ["aptitude-only", 80, null, null, false], ["demand-only", null, 60, null, false], ["feasibility-only", null, null, 90, false],
  ["notes-only", 80, 60, null, true], ["notes-only-partial", 80, null, null, true],
  ["missing-dates", 80, 60, 90, false], ["invalid-dates", 80, 60, 90, false], ["older-source", 80, 60, 90, false], ["conflicting-sources", 80, 60, 90, false],
] as const;
beforeEach(() => { vi.clearAllMocks(); m.rows = []; m.sources = []; vi.stubEnv("SYNTHESIS_API_KEY", "synthetic-key"); });
afterEach(() => { vi.unstubAllEnvs(); });

it.each(cases)("F10 / R03 frozen explanation profile: %s", async (name, a, d, f, notesOnly) => {
  const evidence = structuredClone(outputs), input = { ...profile, academicData: notesOnly ? {} : profile.academicData };
  if (name === "missing-dates" || name === "invalid-dates") for (const output of evidence) {
    output.retrievedChunks[0].ingestion_timestamp = name === "missing-dates" ? "" : "not-a-date";
    output.retrievedChunks[0].publication_date = null;
  }
  if (name === "older-source") evidence[1].retrievedChunks[0].publication_date = "2010-01-01";
  if (name === "conflicting-sources") evidence[1].retrievedChunks.push({ ...evidence[1].retrievedChunks[0], chunk_index: 3, content: "A conflicting public record reports falling demand." });
  const proposed = candidate(a, d, f, notesOnly);
  if (name === "conflicting-sources") proposed.componentEvidence.demand!.sourceReferences.push({ reference: evidence[1].retrievedChunks[1].source_url, chunkIndex: 3 });
  m.generate.mockResolvedValueOnce({ text: JSON.stringify({ candidates: [proposed] }) });
  const synthesis = await synthesisInterpreter.synthesize(evidence, input);
  expect(JSON.stringify(synthesis)).not.toContain(PRIVATE); expect(JSON.stringify(synthesis)).not.toContain(RAW);
  const scored = alignmentScoreCalculator.calculate(synthesis);
  const claims = Object.entries(synthesis.candidates[0].componentEvidence).flatMap(([dimension, support]) => support ? [{ dimension, inputReferences: support.inputReferences, sourceReferences: support.sourceReferences }] : []);
  m.generate.mockResolvedValueOnce({ candidates: [{ content: { parts: [{ thought: true, text: RAW }, { text: JSON.stringify({ rankings: [{ careerPath: proposed.careerPath, claims,
    reasoningSummary: `${PRIVATE} ${RAW}`, internalReasoning: RAW, alignmentScore: 100, rank: 999 }] }) }] } }] });
  const ranked = await rankingAgent.generateReasoning(scored);
  expect(ranked[0].rank).toBe(scored[0].rank); expect(ranked[0].alignmentScore).toBe(scored[0].alignmentScore);
  const prompt = m.generate.mock.calls[1][0].contents;
  expect(prompt).toContain("evidence summaries"); expect(prompt).not.toMatch(/chain.of.thought/i);
  expect(prompt).not.toContain(PRIVATE); expect(prompt).not.toContain(RAW);
  const list = await rankedRecommendationBuilder.build("synthetic", ranked, evidence, 7);
  expect(JSON.stringify({ list, rows: m.rows, sources: m.sources })).not.toContain(PRIVATE);
  expect(JSON.stringify({ list, rows: m.rows, sources: m.sources })).not.toContain(RAW);
  expect(list.recommendations[0].alignmentScore).toBe(a === null || d === null || f === null ? null : scored[0].alignmentScore);
  const payload = await assembleReportData("synthetic", { provider: runRecommendationProvider(input, list) });
  const formatted = formatReasoningSummary(payload.rankedRecommendations.recommendations[0]);
  expect(formatted.isPlaceholder).toBe(false); expect(formatted.claims).toHaveLength(claims.length);
  for (const claim of formatted.claims) {
    expect(claim.score).toBe({ aptitude: a, demand: d, feasibility: f }[claim.dimension]);
    expect(claim.inputReferences.length + claim.sourceReferences.length).toBeGreaterThan(0);
    for (const citation of claim.sourceReferences) expect(evidence.flatMap((o) => o.retrievedChunks).some((chunk) => chunk.source_url === citation.reference && chunk.chunk_index === citation.chunkIndex)).toBe(true);
  }
  const pdf = buildReportPdf(payload), text = await reportPdfText(pdf);
  expect(text).not.toContain(PRIVATE); expect(text).not.toContain(RAW); expect(text).not.toContain("1970");
  expect(text).toContain("AI-generated comparisons");
  expect(text).toContain(list.recommendations[0].sources.length ? "Source currency is unverified" : "No supporting reference sources are available");
  if (name.endsWith("dates")) {
    expect(text).toContain("Publication date unavailable"); expect(text).toContain("Ingestion date unavailable");
    expect(m.sources.every((source) => source.ingestion_timestamp === null && source.publication_date === null)).toBe(true);
  }
  if (name === "older-source") expect(text).toContain("2010-01-01");
  if (notesOnly) expect(formatted.summary).toContain("not measured academic performance");
  const report = { sessionId: "synthetic", reportVersion: 1, generatedAt: payload.generatedAt, expiresAt: "2099-01-01T00:00:00Z", downloadUrl: null,
    recommendationCount: 1, byteLength: pdf.length, academicEvidence: payload.academicEvidence,
    recommendations: [{ ...list.recommendations[0], reasoningSummary: formatted.summary, evidenceClaims: formatted.claims }] };
  const html = renderToStaticMarkup(createElement(ReportDownloadView, { report, onNewSession: () => {} }));
  expect(html).not.toContain(PRIVATE); expect(html).not.toContain(RAW);
  if (d !== null) expect(html).toContain("release=2026#evidence");
  if (process.env.SW18_PDF_QA_DIR && ["balanced", "missing-dates", "conflicting-sources", "notes-only-partial"].includes(name)) {
    mkdirSync(process.env.SW18_PDF_QA_DIR, { recursive: true }); writeFileSync(`${process.env.SW18_PDF_QA_DIR}/${name}.pdf`, pdf);
  }
});

it("the ranking response example preserves the silo identity required by citation validation", async () => {
  m.generate.mockResolvedValueOnce({ text: JSON.stringify({ candidates: [candidate(80, 60, 90)] }) });
  const scored = alignmentScoreCalculator.calculate(await synthesisInterpreter.synthesize(outputs, profile));
  m.generate.mockResolvedValueOnce({ text: JSON.stringify({ rankings: scored.map(path => ({ careerPath: path.careerPath,
    claims: Object.entries(path.componentEvidence).flatMap(([dimension, support]) => support
      ? [{ dimension, inputReferences: support.inputReferences, sourceReferences: support.sourceReferences }] : []) })) }) });
  await rankingAgent.generateReasoning(scored);
  const prompt = m.generate.mock.calls[1][0].contents as string;
  const example = JSON.parse(prompt.split("Return JSON only:\n")[1].split("\nEvidence:")[0]);
  expect(example.rankings[0].claims[0].sourceReferences[0]).toHaveProperty("siloId");
});

it.each(["invented URL", "foreign chunk", "foreign silo", "unapproved input", "missing claim", "duplicate claim", "unknown career", "free prose only"])("rejects %s instead of publishing an unsupported explanation", async (mode) => {
  m.generate.mockResolvedValueOnce({ text: JSON.stringify({ candidates: [candidate(80, 60, 90)] }) });
  const scored = alignmentScoreCalculator.calculate(await synthesisInterpreter.synthesize(outputs, profile));
  const claims = Object.entries(scored[0].componentEvidence).flatMap(([dimension, support]) => support ? [{ dimension, inputReferences: [...support.inputReferences], sourceReferences: support.sourceReferences.map((ref) => ({ ...ref })) }] : []);
  if (mode === "invented URL") claims[1].sourceReferences[0].reference = "https://unsupported.example/";
  if (mode === "foreign chunk") claims[1].sourceReferences[0].chunkIndex = 999;
  if (mode === "foreign silo") claims[1].sourceReferences[0].siloId = "unauthorized_silo";
  if (mode === "unapproved input") claims[0].inputReferences = ["counselorNotes.impression"];
  if (mode === "missing claim") claims.pop();
  if (mode === "duplicate claim") claims[1] = claims[0];
  m.generate.mockResolvedValueOnce({ text: JSON.stringify({ rankings: [{ careerPath: mode === "unknown career" ? "Invented option" : scored[0].careerPath,
    ...(mode === "free prose only" ? { reasoningSummary: RAW } : { claims }) }] }) });
  await expect(rankingAgent.generateReasoning(scored)).rejects.toThrow(/evidence summary|citation/);
  expect(m.rows).toEqual([]);
});

it("withholds legacy free prose and source sentinels during report assembly", async () => {
  m.generate.mockResolvedValueOnce({ text: JSON.stringify({ candidates: [candidate(80, 60, 90)] }) });
  const scored = alignmentScoreCalculator.calculate(await synthesisInterpreter.synthesize(outputs, profile));
  const list = await rankedRecommendationBuilder.build("synthetic", [{ ...scored[0], reasoningSummary: RAW }], outputs, 7);
  expect(JSON.stringify(m.rows)).not.toContain(RAW);
  const saved = await runRecommendationProvider(profile, list).getRankedRecommendations("synthetic");
  expect(JSON.stringify(saved)).not.toContain(RAW); expect(saved.recommendations[0].reasoningSummary).toContain("unavailable");
  const audit = buildAuditTrail({ ...saved, recommendations: [{ ...saved.recommendations[0], sources: [] }] });
  expect(audit[0].sources[0]).toMatchObject({ ingestionTimestamp: null, publicationDate: null, sourceUrl: null });
});

it.each([null, undefined, "", "bad date", "1970-01-01T00:00:00.000Z", "2026-02-30", "2026-02-30T00:00:00Z", "0"])("keeps absent/invalid source dates unavailable: %s", (value) => {
  expect(sourceDate(value)).toBeNull();
});
it("keeps distinct silo records with the same URL and chunk number bound to their own metadata", async () => {
  const evidence = structuredClone(outputs), c = candidate(80, 60, 90);
  for (const [index, output] of evidence.entries()) {
    output.retrievedChunks[0].source_url = "https://example.gov.ph/shared";
    output.retrievedChunks[0].silo_id = `silo-${index}`;
    output.retrievedChunks[0].publication_date = `2026-10-0${index + 1}`;
  }
  c.componentEvidence.demand!.sourceReferences[0].reference = "https://example.gov.ph/shared";
  c.componentEvidence.feasibility!.sourceReferences[0].reference = "https://example.gov.ph/shared";
  m.generate.mockResolvedValueOnce({ text: JSON.stringify({ candidates: [c] }) });
  const synthesis = await synthesisInterpreter.synthesize(evidence, profile), path = synthesis.candidates[0];
  expect(path.sourceReferences.map((source) => [source.siloId, source.publicationDate])).toEqual([["silo-1", "2026-10-02"], ["silo-2", "2026-10-03"]]);
  expect(path.componentEvidence.demand!.sourceReferences[0].siloId).toBe("silo-1");
});
it("retains actual dates and rejects executable or credential-bearing source URLs", () => {
  expect(sourceDate("2026-10-01")).toBe("2026-10-01");
  expect(sourceDate("2026-11-01T00:00:00Z")).toBe("2026-11-01T00:00:00Z");
  expect(publicSourceUrl("javascript:alert(1)")).toBeNull(); expect(publicSourceUrl("https://user:secret@example.com/")).toBeNull();
});

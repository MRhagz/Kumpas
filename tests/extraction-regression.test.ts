import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCorpus, corpusRoot } from "../scripts/extraction/corpus";
import { compare, fields, summarize } from "../scripts/extraction/score";
import { evaluate } from "../scripts/extraction/evaluate";
import { compareReports } from "../scripts/extraction/compare-reports.mjs";
import { validateAcademicContent } from "@/lib/module2/academic-upload-validation";
import { normalizeAcademicData } from "@/lib/module2/extraction-contract";

const corpus = loadCorpus();
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("SW-28 synthetic corpus integrity (no provider calls)", () => {
  it.each(corpus.fixtures)("$id has supported decodable bytes and schema-valid ground truth", async fixture => {
    const bytes = readFileSync(new URL(fixture.file, corpusRoot));
    expect(await validateAcademicContent(bytes, fixture.mimeType)).toBe(fixture.mimeType);
    expect(normalizeAcademicData(fixture.category, fixture.expected.data)).toEqual(fixture.expected);
    expect(fixture.sourceLines.join(" ")).toContain("SYNTHETIC TEST RECORD");
    expect(Object.keys(fields(fixture.expected)).length).toBeGreaterThan(2);
  });
  it("freezes all 15 strata, four formats, zero scores, blank fields and multi-page PDFs", () => {
    expect(corpus.fixtures).toHaveLength(30);
    expect(new Set(corpus.fixtures.map(f => `${f.category}/${f.condition}`)).size).toBe(15);
    expect(corpus.fixtures.some(f => Object.values(fields(f.expected)).includes(0))).toBe(true);
    expect(corpus.fixtures.filter(f => f.condition === "missing-field").every(f => Object.values(fields(f.expected)).includes(null))).toBe(true);
    expect(corpus.fixtures.some(f => f.pages === 2)).toBe(true);
    expect(corpus.independentGroundTruthReview).toBe("pending");
  });
});

describe("field scoring arithmetic (not extraction accuracy)", () => {
  it("distinguishes omitted fields, zero, invented missing values and extra fields", () => {
    expect(compare({ zero: 0, blank: null, absent: null, wrong: 83 }, { zero: 0, blank: 0, wrong: 82, extra: 1 }))
      .toEqual({ correct: 1, total: 5, mismatches: [
        { field: "blank", expected: null, actual: 0, kind: "invented_missing_value" },
        { field: "absent", expected: null, actual: null, kind: "omitted" },
        { field: "wrong", expected: 83, actual: 82, kind: "wrong_value" },
        { field: "extra", expected: null, actual: 1, kind: "unexpected_field" },
      ] });
    expect(compare({ blank: null }, null)).toMatchObject({ correct: 0, total: 1 });
  });
  it("matches reordered Form 137 rows by subject/year/grade level and penalizes duplicates", () => {
    const data = { subjects: [
      { name: "Science", grade: 80, year: "2025-2026", grade_level: "Grade 10" },
      { name: "Science", grade: 90, year: "2026-2027", grade_level: "Grade 11" },
    ], gwa: null, school_year: "2026-2027" };
    const expected = fields({ type: "form_137", data });
    expect(compare(expected, fields({ type: "form_137", data: { ...data, subjects: [...data.subjects].reverse() } }))).toMatchObject({ correct: 4, total: 4 });
    const extra = fields({ type: "form_137", data: { ...data, subjects: [...data.subjects, data.subjects[0]] } });
    expect(compare(expected, extra)).toMatchObject({ correct: 4, total: 5 });
  });
  it("does not round a sub-floor score into a pass and includes failed documents", () => {
    const rows = [{ category: "nat", condition: "clean", correct: 169, total: 200 },
      { category: "ncae", condition: "low-quality", correct: 0, total: 5, error: "provider_failed" }];
    expect(summarize(rows).overall).toMatchObject({ correct: 169, total: 205, failures: 1, meetsFloor: false });
    expect(summarize(rows).byCategory.nat.meetsFloor).toBe(false);
    expect(summarize([{ ...rows[0], correct: 170 }]).overall.meetsFloor).toBe(true);
  });
  it("retains failures and all unattempted cancelled documents without exporting raw errors", async () => {
    const controller = new AbortController();
    const extract = vi.fn().mockImplementationOnce(async () => { throw new Error("SECRET RESPONSE"); })
      .mockImplementationOnce(async () => { controller.abort(); throw new Error("SECRET CANCEL"); });
    const result = await evaluate(corpus.fixtures, extract, controller.signal);
    expect(extract).toHaveBeenCalledTimes(2);
    expect(result.rows).toHaveLength(30);
    expect(result.overall).toMatchObject({ documents: 30, failures: 30, correct: 0, meetsFloor: false });
    expect(result.overall.total).toBe(corpus.fixtures.reduce((n, f) => n + Object.keys(fields(f.expected)).length, 0));
    expect(result.rows[0].error).toBe("extraction_failed");
    expect(result.rows.slice(1).every(row => row.error === "cancelled")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(result.extractionGateMet).toBe(false);
  });
  it("compares live report mismatches only for the same frozen corpus, rejecting mocked evidence", () => {
    // Arithmetic fixtures only: these are not saved or presented as live results.
    const base = { execution: "live_gemini_mocked_persistence", manifestSha256: corpus.manifestSha256,
      build: "previous", model: "model", promptVersion: "prompt", sourceHashes: {}, overall: {}, fieldsRequiringInvestigation: [],
      rows: corpus.fixtures.map(f => ({ id: f.id, sha256: f.sha256, mismatches: [] as { field: string }[] })) };
    const candidate = structuredClone(base); candidate.build = "candidate";
    candidate.rows[0].mismatches.push({ field: "gwa" });
    expect(compareReports(base, candidate).newMismatches).toEqual([`${corpus.fixtures[0].id}/gwa`]);
    expect(() => compareReports({ ...base, execution: "mocked" }, candidate)).toThrow("live extraction reports");
    expect(() => compareReports(base, { ...candidate, manifestSha256: "changed" })).toThrow("identical frozen");
  });
});

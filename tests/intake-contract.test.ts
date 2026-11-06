import { expect, it } from "vitest";
import { academicFields, normalizeAcademicData, normalizeNotes } from "@/lib/module2/extraction-contract";
import { selectAcademicData } from "@/lib/module3/provider-inputs";

it("preserves null scores and legitimate zero through extraction and provider projection", () => {
  const extraction = normalizeAcademicData("ncae", { strand_scores: { Science: null, Mathematics: 0 }, overall_percentile: null, private_debug: "secret" });
  expect(extraction).toEqual({ type: "ncae", data: { strand_scores: { Science: null, Mathematics: 0 }, overall_percentile: null, recommended_strand: null } });
  if (extraction.type !== "ncae") throw new Error();
  expect(selectAcademicData({ ncae: extraction.data }).ncae?.strand_scores).toEqual({ Science: null, Mathematics: 0 });
  expect(academicFields(extraction)).toMatchObject({ "strand_scores.Science": null, "strand_scores.Mathematics": 0 });
});
it.each([NaN, Infinity, -1, 101, "85", {}, []])("rejects invalid NAT scores (%j), without coercion", (score) => {
  expect(() => normalizeAcademicData("nat", { composite_score: score })).toThrow();
});
it("keeps identified subjects with missing final grades and does not compute GWA", () => {
  const value = normalizeAcademicData("form_137", { subjects: [{ name: "Mathematics", grade: null, year: "2025-2026", grade_level: "Grade 10" }] });
  expect(value).toMatchObject({ data: { subjects: [{ name: "Mathematics", grade: null }], gwa: null } });
  expect(() => normalizeAcademicData("form_137", { subjects: [{ name: "Math", grade: 0 }] })).toThrow();
});
it.each([null, [], "raw provider output"])("rejects malformed academic response (%j)", (value) => {
  expect(() => normalizeAcademicData("nat", value)).toThrow();
});
it("keeps optional note fields empty and excludes unexpected provider fields", () => {
  expect(normalizeNotes({ careerGoal: "Undecided", interests: "Math", private_debug: "secret" })).toEqual({ careerGoal: "Undecided", interests: "Math", financial: "", concerns: "", impression: "" });
  expect(() => normalizeNotes({ concerns: 5 })).toThrow();
});

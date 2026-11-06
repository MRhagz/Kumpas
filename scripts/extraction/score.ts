import type { ExtractedAcademicData } from "../../src/types";

export type Fields = Record<string, string | number | null>;
const label = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

// Match rows by printed identity, not provider order or generated UUID. Duplicate
// identities remain separate observations so they cannot silently overwrite scores.
export function fields(value: ExtractedAcademicData): Fields {
  const data = value.data;
  if (value.type === "form_137") {
    const result: Fields = { gwa: value.data.gwa ?? null, school_year: value.data.school_year ?? null };
    const seen = new Map<string, number>();
    for (const row of value.data.subjects) {
      const identity = [row.name, row.grade_level ?? "", row.year].map(label).join("|");
      const occurrence = seen.get(identity) ?? 0;
      seen.set(identity, occurrence + 1);
      result[`subjects.${identity}#${occurrence}`] = row.grade;
    }
    return result;
  }
  const scores = value.type === "nat" ? value.data.subjects : value.data.strand_scores;
  const result: Fields = {};
  for (const [key, score] of Object.entries(scores)) {
    const base = `${value.type === "nat" ? "subjects" : "strand_scores"}.${label(key)}`;
    let unique = base;
    while (Object.hasOwn(result, unique)) unique += "#duplicate";
    result[unique] = score;
  }
  if ("composite_score" in data) {
    result.composite_score = data.composite_score ?? null;
    result.mastery_level = data.mastery_level ?? null;
  } else if ("overall_percentile" in data) {
    result.overall_percentile = data.overall_percentile ?? null;
    result.recommended_strand = data.recommended_strand ?? null;
  }
  return result;
}

export function compare(expected: Fields, actual: Fields | null) {
  const mismatches: { field: string; expected: string | number | null; actual: string | number | null; kind: string }[] = [];
  let correct = 0;
  for (const [field, target] of Object.entries(expected)) {
    const present = actual !== null && Object.hasOwn(actual, field);
    const observed = present ? actual[field] : null;
    const same = present && (typeof target === "string" && typeof observed === "string"
      ? label(target) === label(observed) : target === observed);
    if (same) correct++;
    else mismatches.push({ field, expected: target, actual: observed,
      kind: !present ? "omitted" : target === null ? "invented_missing_value" : "wrong_value" });
  }
  // Hallucinated rows/subjects increase the denominator; omissions never earn a
  // correct null. An all-null response cannot pass missing-field observations.
  for (const field of Object.keys(actual ?? {})) {
    if (!Object.hasOwn(expected, field)) mismatches.push({ field, expected: null, actual: actual![field], kind: "unexpected_field" });
  }
  return { correct, total: Object.keys(expected).length + mismatches.filter(m => m.kind === "unexpected_field").length, mismatches };
}

export function summarize(rows: { category: string; condition: string; correct: number; total: number; error?: string }[]) {
  const count = (values: typeof rows) => {
    const correct = values.reduce((n, row) => n + row.correct, 0);
    const total = values.reduce((n, row) => n + row.total, 0);
    return { documents: values.length, failures: values.filter(row => row.error).length, correct, total,
      accuracy: total ? correct / total : 0, meetsFloor: total > 0 && correct / total >= 0.85 };
  };
  const group = (key: "category" | "condition") => Object.fromEntries([...new Set(rows.map(row => row[key]))]
    .map(value => [value, count(rows.filter(row => row[key] === value))]));
  const byStratum = Object.fromEntries([...new Set(rows.map(row => `${row.category}/${row.condition}`))]
    .map(value => [value, count(rows.filter(row => `${row.category}/${row.condition}` === value))]));
  return { overall: count(rows), byCategory: group("category"), byCondition: group("condition"), byStratum };
}

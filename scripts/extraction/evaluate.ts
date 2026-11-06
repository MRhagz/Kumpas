import type { ExtractedAcademicData } from "../../src/types";
import type { Fixture } from "./corpus";
import { compare, fields, summarize } from "./score";

export async function evaluate(fixtures: Fixture[], extract: (fixture: Fixture) => Promise<ExtractedAcademicData | null>, signal: AbortSignal) {
  const rows = [];
  for (const fixture of fixtures) {
    let actual: ExtractedAcademicData | null = null;
    let error: string | undefined;
    if (signal.aborted) error = "cancelled";
    else {
      try { actual = await extract(fixture); }
      catch { error = signal.aborted ? "cancelled" : "extraction_failed"; }
    }
    const result = compare(fields(fixture.expected), actual ? fields(actual) : null);
    rows.push({ id: fixture.id, category: fixture.category, condition: fixture.condition,
      format: fixture.format, sha256: fixture.sha256, error, ...result });
  }
  const summary = summarize(rows);
  const byField: Record<string, { correct: number; total: number }> = {};
  for (const [index, row] of rows.entries()) {
    const expected = fields(fixtures[index].expected);
    for (const field of new Set([...Object.keys(expected), ...row.mismatches.map(m => m.field)])) {
      const key = `${row.category}/${field}`;
      const group = byField[key] ??= { correct: 0, total: 0 };
      group.total++;
      if (!row.mismatches.some(m => m.field === field)) group.correct++;
    }
  }
  const holds = Object.entries(byField).filter(([, value]) => value.correct / value.total < 0.85).map(([field]) => field);
  return { rows, ...summary, byField, fieldsRequiringInvestigation: holds,
    extractionGateMet: summary.overall.meetsFloor && summary.overall.failures === 0 && holds.length === 0 };
}

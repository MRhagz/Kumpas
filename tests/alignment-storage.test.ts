import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const proposedMigration = new URL("../docs/sw16-scoring-migration.sql", import.meta.url);
const evidence = JSON.stringify({ aptitude: { inputReferences: ["academicData.nat.subjects.Mathematics"] } });
const weights = JSON.stringify({ aptitude: 0.35, demand: 0.40, feasibility: 0.25 });

beforeAll(async () => {
  await db.exec(`create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table public.sessions(id uuid primary key, counselor_id uuid);
    insert into public.sessions values ('11111111-1111-4111-8111-111111111111', null);`);
  await db.exec(readFileSync(new URL("20260523000002_module3_recommendations.sql", migrationDirectory), "utf8"));
  await db.exec(`insert into public.ranked_recommendations(session_id, rank, career_path, alignment_score, aptitude_fit, market_demand, financial_feasibility, reasoning_summary)
    values ('11111111-1111-4111-8111-111111111111', 1, 'Legacy', 0.85, 0.8, 0.9, 0.7, 'Legacy');`);
  await db.exec(readFileSync(proposedMigration, "utf8"));
}, 30000);
afterAll(() => db.close());

async function insert(a: number | null, d: number | null, f: number | null, total: number | null, rank: number | null, status = "complete") {
  return db.query(`insert into public.ranked_recommendations(session_id, career_path, rank, alignment_score,
    aptitude_fit, market_demand, financial_feasibility, reasoning_summary, status, incomplete_reason,
    component_evidence, score_weights, score_contract)
    values ('11111111-1111-4111-8111-111111111111', 'Synthetic', $1, $2, $3, $4, $5, 'Explanation', $6, 'Missing feasibility', $7::jsonb, $8::jsonb, '0-100-v1')`,
    [rank, total, a, d, f, status, evidence, weights]);
}

describe("SW-16 stored scoring contract", () => {
  it("preserves legacy values and marks their contract explicitly", async () => {
    const result = await db.query("select alignment_score, score_contract from public.ranked_recommendations where career_path = 'Legacy'");
    expect(result.rows).toEqual([{ alignment_score: 0.85, score_contract: "legacy-0-1" }]);
  });
  it("stores the SRS score, ties and nullable partial comparisons", async () => {
    await insert(80, 60, 90, 74.5, 1);
    await insert(80, 60, 90, 74.5, 1);
    await insert(80, 60, null, null, null, "incomplete");
    const result = await db.query("select rank, alignment_score, financial_feasibility from public.ranked_recommendations where rank is null");
    expect(result.rows).toEqual([{ rank: null, alignment_score: null, financial_feasibility: null }]);
  });
  it.each([
    [101, 60, 90, 81.85, 1, "complete"], [-1, 60, 90, 46.15, 1, "complete"],
    [80, 60, null, 52, 1, "complete"], [80, 60, 90, 74.501, 1, "complete"],
    [null, null, null, null, null, "incomplete"], [80, 60, 90, null, null, "complete"],
    [NaN, 60, 90, 74.5, 1, "complete"],
  ] as const)("rejects invalid stored scores %j", async (a, d, f, total, rank, status) => {
    await expect(insert(a, d, f, total, rank, status)).rejects.toThrow(/ranked_recommendations_supported_scores/);
  });
});

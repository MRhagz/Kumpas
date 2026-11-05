import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

// A narrow PostgREST query adapter; predicates and mutations execute in real Postgres.
const connection = vi.hoisted(() => ({ db: null as PGlite | null }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => new Query() } }));
class Query {
  operation = "select";
  values: Record<string, unknown> = {};
  predicates: string[] = [];
  parameters: unknown[] = [];
  columns = "*";
  select(columns = "*") { this.columns = columns; return this; }
  insert(values: Record<string, unknown>) { this.operation = "insert"; this.values = values; return this; }
  update(values: Record<string, unknown>) { this.operation = "update"; this.values = values; return this; }
  delete() { this.operation = "delete"; return this; }
  eq(key: string, value: unknown) { this.parameters.push(value); this.predicates.push(`${key} = $${this.parameters.length}`); return this; }
  is(key: string) { this.predicates.push(`${key} is null`); return this; }
  or(expression: string) {
    this.parameters.push(expression.split("upload_expires_at.lt.")[1]);
    this.predicates.push(`(upload_token is null or upload_expires_at < $${this.parameters.length})`); return this;
  }
  async execute(single = false) {
    const keys = Object.keys(this.values);
    const params = [...this.parameters];
    const valueParams = keys.map((key) => { params.push(typeof this.values[key] === "object" && this.values[key] !== null ? JSON.stringify(this.values[key]) : this.values[key]); return `$${params.length}`; });
    const where = this.predicates.length ? ` where ${this.predicates.join(" and ")}` : "";
    let sql = `select ${this.columns} from extraction_results${where}`;
    if (this.operation === "insert") sql = `insert into extraction_results (${keys.join(",")}) values (${valueParams.join(",")}) returning ${this.columns}`;
    if (this.operation === "update") sql = `update extraction_results set ${keys.map((key, i) => `${key} = ${valueParams[i]}`).join(",")}${where} returning ${this.columns}`;
    if (this.operation === "delete") sql = `delete from extraction_results${where} returning ${this.columns}`;
    try {
      const { rows } = await connection.db!.query(sql, params);
      return { data: single ? rows[0] ?? null : rows, error: null };
    } catch (error) { return { data: null, error }; }
  }
  maybeSingle() { return this.execute(true); }
  single() { return this.execute(true).then((result) => result.data ? result : { ...result, error: result.error ?? { message: "No matching row" } }); }
  then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) { return this.execute().then(resolve, reject); }
}

import { academicDocumentStore } from "@/lib/module2/academic-document-store";
import { geminiExtractionService } from "@/lib/module2/gemini-extraction-service";
import { studentProfileBuilder } from "@/lib/module2/student-profile-builder";
vi.mock("@/lib/module5/session-progress", () => ({ sessionProgressTracker: {} }));
const migration = readFileSync(new URL("../supabase/migrations/20261104144015_sw03_academic_upload_validation.sql", import.meta.url), "utf8");
const session = "10000000-0000-4000-8000-000000000001";
const owner = "20000000-0000-4000-8000-000000000001";
const doc = "30000000-0000-4000-8000-000000000001";
const setup = `create schema storage; create table storage.buckets (id text primary key, file_size_limit bigint);
  insert into storage.buckets values ('kumpas-documents',10485760);
  create table extraction_results (id uuid primary key, session_id uuid not null, counselor_id uuid not null,
    document_type text not null, structured_data jsonb not null, raw_gemini_response jsonb,
    redacted_image_path text, created_at timestamptz default now());`;
beforeAll(async () => { connection.db = new PGlite(); await connection.db.exec(setup); await connection.db.exec(migration); }, 30_000);
beforeEach(async () => { await connection.db!.exec("delete from extraction_results"); });
afterAll(async () => { await connection.db!.close(); vi.unstubAllGlobals(); }, 30_000);

async function seed() {
  await connection.db!.query(`insert into extraction_results (id,session_id,counselor_id,document_type,structured_data,redacted_image_path)
    values ($1,$2,$3,'nat',$4,$5)`, [doc, session, owner, JSON.stringify({ type: "nat", data: { composite_score: 60 } }), `${session}/${doc}.jpg`]);
}

it("allows zero records, and at most one of each academic type even under concurrent claims", async () => {
  expect((await connection.db!.query("select * from extraction_results")).rows).toHaveLength(0);
  const results = await Promise.allSettled([academicDocumentStore.claim(session, owner, "nat", null), academicDocumentStore.claim(session, owner, "nat", null)]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toMatchObject([{ reason: { status: 409 } }]);
  await academicDocumentStore.claim(session, owner, "ncae", null);
  await academicDocumentStore.claim(session, owner, "form_137", null);
  expect((await connection.db!.query("select * from extraction_results")).rows).toHaveLength(3);
});
it("requires the exact current document for replacement, and preserves it on failure", async () => {
  await seed();
  await expect(academicDocumentStore.claim(session, owner, "nat", null)).rejects.toMatchObject({ status: 409 });
  await expect(academicDocumentStore.claim(session, owner, "nat", owner)).rejects.toMatchObject({ status: 409 });
  const claim = await academicDocumentStore.claim(session, owner, "nat", doc);
  await expect(academicDocumentStore.claim(session, owner, "nat", doc)).rejects.toMatchObject({ status: 409 });
  await academicDocumentStore.release(claim);
  const { rows } = await connection.db!.query<{ structured_data: unknown; upload_token: string | null }>("select * from extraction_results");
  expect(rows).toHaveLength(1); expect(rows[0].structured_data).toEqual({ type: "nat", data: { composite_score: 60 } });
  expect(rows[0].upload_token).toBeNull();
});
it("successful extraction replaces values in the same row, without old or duplicated values", async () => {
  await seed();
  const claim = await academicDocumentStore.claim(session, owner, "nat", doc);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: '{"composite_score":90}' }] } }] })));
  await geminiExtractionService.extract(Buffer.from("redacted"), "nat", session, owner, `${session}/new.jpg`, claim);
  const { rows } = await connection.db!.query<{ structured_data: unknown; upload_token: string | null }>("select * from extraction_results");
  expect(rows).toHaveLength(1); expect(rows[0].structured_data).toEqual({ type: "nat", data: { composite_score: 90 } }); expect(rows[0].upload_token).toBeNull();
  await expect(academicDocumentStore.claim(session, owner, "nat", doc)).rejects.toMatchObject({ status: 409 });
});
it("does not implicitly overwrite a legacy extraction whose image reference is missing", async () => {
  await seed();
  await connection.db!.query("update extraction_results set redacted_image_path = null");
  await expect(academicDocumentStore.claim(session, owner, "nat", null)).rejects.toMatchObject({ status: 409 });
  expect((await connection.db!.query<{ structured_data: unknown }>("select structured_data from extraction_results")).rows[0].structured_data).toEqual({ type: "nat", data: { composite_score: 60 } });
});
it("expired leases can be reclaimed; late results and cleanup cannot overwrite or remove the new claim", async () => {
  const old = await academicDocumentStore.claim(session, owner, "nat", null);
  await connection.db!.query("update extraction_results set upload_expires_at = now() - interval '1 second'");
  const current = await academicDocumentStore.claim(session, owner, "nat", null);
  await academicDocumentStore.release(old);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] })));
  await expect(geminiExtractionService.extract(Buffer.from("redacted"), "nat", session, owner, "old.jpg", old)).rejects.toThrow();
  expect((await connection.db!.query<{ upload_token: string }>("select upload_token from extraction_results")).rows[0].upload_token).toBe(current.token);
  await academicDocumentStore.release(current);
  expect((await connection.db!.query("select * from extraction_results")).rows).toHaveLength(0);
});
it("removes persisted values and rejects approval during an active replacement", async () => {
  await seed();
  const claim = await academicDocumentStore.claim(session, owner, "nat", doc);
  await expect(studentProfileBuilder.buildAndSave({ sessionId: session, counselorId: owner, counselorNotes: { careerGoal: "Undecided", interests: "Math", financial: "", concerns: "", impression: "" }, corrections: [] })).rejects.toThrow("still in progress");
  await academicDocumentStore.remove(claim);
  expect((await connection.db!.query("select * from extraction_results")).rows).toHaveLength(0);
});
it("migration refuses legacy duplicates without changing or deleting their data", async () => {
  const legacy = new PGlite(); await legacy.exec(setup);
  await legacy.query(`insert into extraction_results (id,session_id,counselor_id,document_type,structured_data)
    values ($1,$3,$4,'form_137','{}'),($2,$3,$4,'form_137','{}')`, [doc, owner, session, owner]);
  await expect(legacy.exec(migration)).rejects.toThrow("duplicate academic records");
  expect((await legacy.query("select * from extraction_results")).rows).toHaveLength(2);
  await legacy.close();
});
it("sets the deployed document bucket limit to the same decimal byte count", async () => {
  expect((await connection.db!.query<{ file_size_limit: number }>("select file_size_limit from storage.buckets")).rows[0].file_size_limit).toBe(10_000_000);
});

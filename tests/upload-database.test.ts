import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const connection = vi.hoisted(() => ({ db: null as PGlite | null }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {
  rpc: async (name: string, args: Record<string, unknown>) => {
    const keys = Object.keys(args);
    try {
      const result = await connection.db!.query(`select * from public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")})`,
        keys.map((key) => typeof args[key] === "object" && args[key] !== null ? JSON.stringify(args[key]) : args[key]));
      return { data: result.rows[0], error: null };
    } catch (error) { return { data: null, error }; }
  },
} }));
import { academicDocumentStore } from "@/lib/module2/academic-document-store";
import { geminiExtractionService } from "@/lib/module2/gemini-extraction-service";

const owner = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const baseline = readFileSync(new URL("../supabase/migrations/20260523000000_module2_sessions.sql", import.meta.url), "utf8");
const sw02 = readFileSync(new URL("../supabase/migrations/20261105030355_sw02_versioned_contracts.sql", import.meta.url), "utf8");
const sw03 = readFileSync(new URL("../supabase/migrations/20261104144015_sw03_academic_upload_validation.sql", import.meta.url), "utf8");
const sw06 = readFileSync(new URL("../supabase/migrations/20261106110326_sw06_extraction_drafts_cleanup.sql", import.meta.url), "utf8");
const db = () => connection.db!;
beforeAll(async () => {
  connection.db = new PGlite();
  await db().exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]); create table storage.objects(bucket_id text);`);
  await db().exec(baseline);
  await db().exec(sw02);
  await db().exec(sw03);
  await db().exec(`insert into sessions(id,counselor_id) values ('${other}','${owner}');
    insert into extraction_results(session_id,counselor_id,document_type,structured_data,redacted_image_path)
    values ('${other}','${owner}','nat','{"type":"nat","data":{"composite_score":60}}','legacy/object.jpg');`);
  await db().exec(sw06);
  await db().exec("grant select, insert, update, delete on all tables in schema public to service_role");
}, 30_000);
afterAll(async () => { await db().close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); }, 30_000);
beforeEach(() => { vi.stubEnv("DOCUMENT_INTAKE_API_KEY", "synthetic-test-key"); });
async function session() {
  return (await db().query<{ id: string }>("insert into sessions(counselor_id) values ($1) returning id", [owner])).rows[0].id;
}
function response(data: unknown, evidence_state = "provided") {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ evidence_state, data }) }] } }] })));
}
async function extract(id: string, replacement: string | null = null) {
  const claim = await academicDocumentStore.claim(id, owner, "nat", replacement);
  const row = await geminiExtractionService.extract(Buffer.from("synthetic"), "nat", id, owner, "image/png", claim);
  return { row, claim };
}

it("backfills legacy provenance honestly and registers cleanup without deleting its file reference", async () => {
  const row = (await db().query<{ original_data: unknown; provenance: unknown; redacted_image_path: string }>("select * from extraction_results where session_id=$1", [other])).rows[0];
  expect(row.provenance).toEqual({});
  expect(row.original_data).toEqual({ type: "nat", data: { composite_score: 60 } });
  expect(row.redacted_image_path).toBe("legacy/object.jpg");
  expect((await db().query("select * from extraction_artifact_cleanup where object_path='legacy/object.jpg'")).rows).toHaveLength(1);
});
it("allows only one claim per type; three categories remain optional", async () => {
  const id = await session();
  expect((await db().query("select * from extraction_results where session_id=$1", [id])).rows).toHaveLength(0);
  const attempts = await Promise.allSettled([academicDocumentStore.claim(id, owner, "nat", null), academicDocumentStore.claim(id, owner, "nat", null)]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(attempts.filter((r) => r.status === "rejected")).toMatchObject([{ reason: { status: 409 } }]);
  await academicDocumentStore.claim(id, owner, "ncae", null);
  await academicDocumentStore.claim(id, owner, "form_137", null);
});
it("replaces using stable document identity after images are removed; failed replacement preserves corrections", async () => {
  const id = await session(); response({ composite_score: 0, subjects: { Science: null } });
  const { row } = await extract(id);
  expect(row.structured_data).toEqual({ type: "nat", data: { subjects: { Science: null }, composite_score: 0, mastery_level: null } });
  await db().query("select public.save_extraction_draft($1,$2,$3,$4,$5)", [id, owner, row.id, row.draft_revision,
    { type: "nat", data: { subjects: { Science: null }, composite_score: 75, mastery_level: null } }]);
  const claim = await academicDocumentStore.claim(id, owner, "nat", row.id);
  await expect(academicDocumentStore.claim(id, owner, "nat", row.id)).rejects.toMatchObject({ status: 409 });
  await academicDocumentStore.release(claim);
  const current = (await db().query<{ structured_data: { data: { composite_score: number } }; original_data: unknown }>("select * from extraction_results where id=$1", [row.id])).rows[0];
  expect(current.structured_data.data.composite_score).toBe(75);
  expect(current.original_data).toEqual(row.structured_data);
  await expect(academicDocumentStore.claim(id, owner, "nat", owner)).rejects.toMatchObject({ status: 409 });
  response({ composite_score: 90 });
  const replacement = await extract(id, row.id);
  expect(replacement.row.id).toBe(row.id);
  expect(replacement.row.draft_revision).toBe(3);
});
it("expired claims can be reclaimed and old invocations cannot save or release newer work", async () => {
  const id = await session();
  const old = await academicDocumentStore.claim(id, owner, "nat", null);
  await db().query("update extraction_results set upload_expires_at=now()-interval '1 second' where id=$1", [old.id]);
  const current = await academicDocumentStore.claim(id, owner, "nat", null);
  await academicDocumentStore.release(old);
  response({});
  await expect(geminiExtractionService.extract(Buffer.from("x"), "nat", id, owner, "image/png", old)).rejects.toMatchObject({ status: 409 });
  expect((await db().query<{ upload_token: string }>("select upload_token from extraction_results where id=$1", [old.id])).rows[0].upload_token).toBe(current.token);
  await academicDocumentStore.release(current);
  expect((await db().query("select * from extraction_results where session_id=$1", [id])).rows).toHaveLength(0);
});
it.each(["cancelled", "expired"])("rejects late extraction after session %s", async (status) => {
  const id = await session();
  const claim = await academicDocumentStore.claim(id, owner, "nat", null);
  await db().query("update sessions set status=$2 where id=$1", [id, status]);
  response({});
  await expect(geminiExtractionService.extract(Buffer.from("x"), "nat", id, owner, "image/png", claim)).rejects.toMatchObject({ status: 404 });
});
it("checks owner, actual expiry, approved-session locking and null/stale revisions in SQL", async () => {
  const id = await session(); response({ composite_score: 80 });
  await expect(academicDocumentStore.claim(id, other, "nat", null)).rejects.toMatchObject({ status: 404 });
  const { row } = await extract(id);
  for (const revision of [null, 0]) await expect(db().query("select public.save_extraction_draft($1,$2,$3,$4,$5)", [id, owner, row.id, revision, row.structured_data])).rejects.toThrow(/Draft changed/);
  await db().query("update sessions set current_profile_version=1 where id=$1", [id]);
  await expect(academicDocumentStore.claim(id, owner, "nat", row.id)).rejects.toMatchObject({ status: 409 });
  const expired = (await db().query<{ id: string }>("insert into sessions(counselor_id,created_at) values ($1,now()-interval '25 hours') returning id", [owner])).rows[0].id;
  await expect(academicDocumentStore.claim(expired, owner, "nat", null)).rejects.toMatchObject({ status: 404 });
});
it.each(["unreadable", "unsupported"])("persists %s evidence with null values rather than provider-invented scores", async (evidence) => {
  const id = await session(); response({ composite_score: 100 }, evidence);
  const { row } = await extract(id);
  expect(row.evidence_state).toBe(evidence);
  expect(row.structured_data).toMatchObject({ data: { composite_score: null } });
});
it("retains cleanup work after parent deletion; leases isolate competing and interrupted workers", async () => {
  const id = await session(); response({}); const { row } = await extract(id);
  await db().query("update extraction_results set redacted_image_path='retry/object.jpg' where id=$1", [row.id]);
  await db().query("delete from sessions where id=$1", [id]);
  const first = await db().query<{ lease_token: string }>("select * from claim_extraction_cleanup(10,$1)", [id]);
  expect(first.rows).toHaveLength(1);
  expect((await db().query("select * from claim_extraction_cleanup(10,$1)", [id])).rows).toHaveLength(0);
  await db().query("update extraction_artifact_cleanup set lease_until=now()-interval '1 second' where session_id=$1", [id]);
  const retry = await db().query<{ lease_token: string; attempts: number }>("select * from claim_extraction_cleanup(10,$1)", [id]);
  expect(retry.rows[0].lease_token).not.toBe(first.rows[0].lease_token);
  expect(retry.rows[0].attempts).toBe(2);
  expect((await db().query("delete from extraction_artifact_cleanup where session_id=$1 and lease_token=$2 returning id", [id, first.rows[0].lease_token])).rows).toHaveLength(0);
});
it("saves notes revisions without approving a profile and refuses concurrent overwrites", async () => {
  const id = await session();
  await db().query("insert into session_notes(session_id,counselor_id) values ($1,$2)", [id, owner]);
  const notes = { careerGoal: "Undecided", interests: "Math", financial: "", concerns: "", impression: "" };
  await db().query("select public.save_intake_notes($1,$2,0,$3,$4,true)", [id, owner, notes, { documentId: other, page: 1 }]);
  await expect(db().query("select public.save_intake_notes($1,$2,0,$3,null,false)", [id, owner, notes])).rejects.toThrow(/Notes changed/);
  const draft = (await db().query<{ value: { notes: { revision: number; source: unknown }; uploadPending: boolean } }>("select read_intake_draft($1,$2) as value", [id, owner])).rows[0].value;
  expect(draft.notes.revision).toBe(1); expect(draft.notes.source).toEqual({ documentId: other, page: 1 });
  expect((await db().query<{ current_profile_version: number }>("select current_profile_version from sessions where id=$1", [id])).rows[0].current_profile_version).toBe(0);
});
it("all new RPCs are invoker functions unavailable to browser roles, and cleanup rows have RLS", async () => {
  const result = await db().query<{ n: number }>(`select count(*)::int n from pg_proc where proname in
    ('guard_intake_session','claim_academic_upload','finish_academic_upload','release_academic_upload','remove_academic_upload',
     'save_extraction_draft','save_intake_notes','read_intake_draft','claim_extraction_cleanup','queue_extraction_artifact')
    and (prosecdef or has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute'))`);
  expect(result.rows[0].n).toBe(0);
  expect((await db().query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid='extraction_artifact_cleanup'::regclass")).rows[0].relrowsecurity).toBe(true);
});

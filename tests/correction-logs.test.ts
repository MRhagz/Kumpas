import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { academicCorrections } from "@/lib/module2/correction-audit";
import { normalizeAcademicData } from "@/lib/module2/extraction-contract";
import { selectAcademicData } from "@/lib/module3/provider-inputs";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const evaluator = "22222222-2222-4222-8222-222222222222";
const authSession = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const projection = "session_id,field_name,extracted_value,corrected_value,correction_timestamp";
const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}',
      invited_at timestamptz, email_confirmed_at timestamptz, is_anonymous boolean default false, banned_until timestamptz, deleted_at timestamptz);
    create table auth.sessions(id uuid primary key, user_id uuid, not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims', true)::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text);
  `);
  for (const name of ["20260523000000_module2_sessions", "20260523000001_module2_grants",
    "20260523000002_module3_recommendations", "20260524000000_create_profiles",
    "20260524000001_tighten_session_security", "20260524000002_module5_session_progress",
    "20261104132302_sw01_invited_counselor_access"]) await db.exec(migration(name));
  // Simulate safe/unsafe historical entries before upgrade.
  await db.exec(`insert into sessions(id,counselor_id) values ('${owner}','${owner}');
    insert into correction_logs(session_id,field_name,corrected_value) values
      ('${owner}','ncae.overall_percentile','80'), ('${owner}','notes.concerns','CONFIDENTIAL'),
      ('${owner}','ncae.strand_scores.STUDENT_NAME','80');`);
  // Test-only clock; deployed functions have no clock override.
  await db.exec(`create function public.sw08_test_clock() returns timestamptz language sql as
    $$ select coalesce(nullif(current_setting('sw08.clock', true), '')::timestamptz, clock_timestamp()) $$`);
  await db.exec(migration("20261106132602_sw08_restricted_correction_logs")
    .replaceAll("clock_timestamp()", "public.sw08_test_clock()")
    .replaceAll("statement_timestamp()", "public.sw08_test_clock()"));
  await db.exec("create policy legacy_correction_read on correction_logs for select to authenticated using (true)");
  await db.exec(`insert into auth.users(id,email_confirmed_at,invited_at,raw_app_meta_data) values
    ('${owner}',now(),now(),'{"role":"counselor","counselor_activated":true}'),
    ('${evaluator}',now(),now(),'{"role":"accuracy_evaluator","evaluation_authorized":true}');
    insert into auth.sessions values ('${authSession}','${evaluator}',null);`);
}, 30000);
afterAll(async () => { await db.close(); });
async function asRole(role: string, work: () => Promise<void>, user = evaluator, extra = {}) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, session_id: authSession, exp: 4102444800, ...extra })]);
    await db.exec(`set local role ${role}`);
    await work();
  } finally { await db.exec("rollback"); }
}
async function insert(session = owner, field = "ncae.overall_percentile", value = "82") {
  return db.query("insert into correction_logs(session_id,field_name,extracted_value,corrected_value) values ($1,$2,'80',$3)", [session, field, value]);
}
it("removes forbidden legacy entries without copying their content", async () => {
  expect((await db.query("select field_name from correction_logs")).rows).toEqual([{ field_name: "ncae.overall_percentile" }]);
});
it("permits only the authorized evaluator's five audit columns", async () => {
  await asRole("authenticated", async () => {
    const rows = (await db.query<Record<string, unknown>>(`select ${projection} from correction_logs`)).rows;
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(projection.split(",").sort());
  });
  await asRole("authenticated", async () => {
    await expect(db.query("select * from correction_logs")).rejects.toThrow(/permission denied/);
  });
  for (const role of ["anon", "authenticated"]) await asRole(role, async () => {
    if (role === "anon") await expect(db.query<Record<string, unknown>>(`select ${projection} from correction_logs`)).rejects.toThrow(/permission denied/);
    else expect((await db.query<Record<string, unknown>>(`select ${projection} from correction_logs`)).rows).toEqual([]);
  }, owner);
});
it("rejects user-metadata promotion, expired/revoked sessions and live role revocation", async () => {
  await db.query("update auth.users set raw_app_meta_data='{}',raw_user_meta_data=$1 where id=$2",
    [{ role: "accuracy_evaluator", evaluation_authorized: true }, evaluator]);
  await asRole("authenticated", async () => expect((await db.query<Record<string, unknown>>(`select ${projection} from correction_logs`)).rows).toEqual([]), evaluator,
    { app_metadata: { role: "accuracy_evaluator", evaluation_authorized: true } });
  await db.query("update auth.users set raw_app_meta_data=$1 where id=$2", [{ role: "accuracy_evaluator", evaluation_authorized: true }, evaluator]);
  for (const extra of [{ exp: 1 }, { session_id: owner }]) await asRole("authenticated", async () => {
    expect((await db.query<Record<string, unknown>>(`select ${projection} from correction_logs`)).rows).toEqual([]);
  }, evaluator, extra);
});
it("denies evaluator writes and cleanup execution", async () => {
  for (const sql of ["delete from correction_logs", "update correction_logs set corrected_value='99'",
    `insert into correction_logs(session_id,field_name,corrected_value) values ('${owner}','ncae.overall_percentile','90')`,
    "select purge_expired_correction_logs()"]) await asRole("authenticated", async () => {
    await expect(db.exec(sql)).rejects.toThrow(/permission denied/);
  });
});
it.each(["notes.concerns", "student_name", "filename", "raw_gemini_response", "ncae.strand_scores.STUDENT_NAME"])("denies forbidden field %s", async (field) => {
  await expect(insert(owner, field)).rejects.toThrow(/correction_logs_academic_only/);
});
it.each(["CONFIDENTIAL NOTES", "student.pdf", "{\"raw_model\":true}"])("denies narrative values in academic fields: %s", async (value) => {
  await expect(insert(owner, "ncae.overall_percentile", value)).rejects.toThrow();
});
it.each([
  ["2024-02-29T23:59:59.123Z", "2025-02-28T23:59:59.123Z"],
  ["2023-02-28T11:12:13.000Z", "2024-02-28T11:12:13.000Z"],
  ["2024-01-31T23:59:59.000Z", "2025-01-31T23:59:59.000Z"],
  ["2024-08-31T00:01:02.000Z", "2025-08-31T00:01:02.000Z"],
  ["2024-03-01T00:30:00+08:00", "2025-02-28T16:30:00.000Z"],
])("expires %s at %s independently of database timezone", async (created, expected) => {
  await db.exec("set timezone='America/New_York'");
  const value = (await db.query<{ expiry: Date }>("select correction_log_expiry($1) as expiry", [created])).rows[0].expiry;
  expect(value.toISOString()).toBe(expected);
});
it("stamps retention from session creation; termination and deletion preserve the immutable audit", async () => {
  const session = (await db.query<{ id: string }>("insert into sessions(counselor_id,created_at) values ($1,clock_timestamp()-interval '3 months') returning id", [owner])).rows[0].id;
  await insert(session);
  const before = (await db.query<{ expires_at: Date }>("select * from correction_logs where session_id=$1", [session])).rows;
  const expected = (await db.query<{ expires_at: Date }>("select correction_log_expiry(created_at) as expires_at from sessions where id=$1", [session])).rows[0];
  expect(before[0].expires_at).toEqual(expected.expires_at);
  await db.query("update sessions set status='cancelled',approved_profile=null where id=$1", [session]);
  await db.query("delete from sessions where id=$1", [session]);
  expect((await db.query<{ expires_at: Date }>("select * from correction_logs where session_id=$1", [session])).rows).toEqual(before);
  await expect(db.query("update correction_logs set expires_at=now() where session_id=$1", [session])).rejects.toThrow(/append-only/);
  await expect(insert(session)).rejects.toThrow(/unavailable/);
  await asRole("service_role", async () => { expect((await db.query<{ n: number }>("select purge_expired_correction_logs() as n")).rows[0].n).toBe(0); });
});
it("hides audits exactly at expiry and purges expired rows idempotently", async () => {
  // Use a test-only clock projection to move the fixed expiry around one boundary;
  // the application migration never exposes an override.
  await db.exec("begin");
  try {
    await db.exec("alter table correction_logs disable trigger correction_log_stamp");
    await db.exec("update correction_logs set expires_at='2030-02-28T12:34:56.123Z'");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: evaluator, session_id: authSession, exp: 4102444800 })]);
    for (const [clock, visible] of [["2030-02-28T12:34:56.122Z", true], ["2030-02-28T12:34:56.123Z", false], ["2030-02-28T12:34:56.124Z", false]] as const) {
      await db.query("select set_config('sw08.clock',$1,true)", [clock]);
      await db.exec("set local role authenticated");
      expect((await db.query(`select ${projection} from correction_logs`)).rows.length > 0).toBe(visible);
      await db.exec("reset role");
    }
    await db.exec("reset role; set local role service_role");
    expect(Number((await db.query<{ n: number }>("select purge_expired_correction_logs() as n")).rows[0].n)).toBeGreaterThan(0);
    expect(Number((await db.query<{ n: number }>("select purge_expired_correction_logs() as n")).rows[0].n)).toBe(0);
  } finally { await db.exec("rollback"); }
});
it("projects numeric keys without labels, free text, filenames or model traces", () => {
  const original = normalizeAcademicData("ncae", { strand_scores: { STUDENT_NAME: 80 }, recommended_strand: "STUDENT_NAME" });
  const corrected = normalizeAcademicData("ncae", { strand_scores: { STUDENT_NAME: 90 }, recommended_strand: "STEM" });
  const logs = academicCorrections(owner, original, corrected);
  expect(logs).toEqual([{ session_id: owner, field_name: "ncae.strand_scores.0", extracted_value: "80", corrected_value: "90" }]);
  expect(JSON.stringify(logs)).not.toContain("STUDENT_NAME");
  expect(selectAcademicData({ ncae: { strand_scores: { STEM: 90 } }, correction_logs: logs } as Parameters<typeof selectAcademicData>[0])).not.toHaveProperty("correction_logs");
});

it("compares subject identities before emitting label-free ordinals, including removals", () => {
  const original = normalizeAcademicData("nat", { subjects: { Science: 80, Mathematics: 90 } });
  const corrected = normalizeAcademicData("nat", { subjects: { Mathematics: 90 } });
  expect(academicCorrections(owner, original, corrected)).toEqual([
    { session_id: owner, field_name: "nat.subjects.0", extracted_value: "80", corrected_value: "" },
  ]);
  expect(academicCorrections(owner, original, normalizeAcademicData("nat", { subjects: { Mathematics: 90, Science: 80 } }))).toEqual([]);
});

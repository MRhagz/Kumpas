import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const created = "2026-11-05T00:00:00Z";
const draftExpiry = "2026-11-06T00:00:00Z";
const pdfExpiry = "2026-11-06T00:04:00Z";
const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
async function clock(time: string) { await db.query("select set_config('sw23.clock',$1,false)", [time]); }

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, raw_app_meta_data jsonb default '{}',
      invited_at timestamptz, email_confirmed_at timestamptz, is_anonymous boolean default false,
      banned_until timestamptz, deleted_at timestamptz);
    create table auth.sessions(id uuid primary key, user_id uuid, not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text, name text);
    create function public.sw23_test_clock() returns timestamptz language sql as
      $$ select current_setting('sw23.clock')::timestamptz $$;`);
  await clock("2026-11-05T00:04:00Z");
  for (const name of ["20260523000000_module2_sessions", "20260523000001_module2_grants",
    "20260523000002_module3_recommendations", "20260524000000_create_profiles",
    "20260524000001_tighten_session_security", "20260524000002_module5_session_progress",
    "20261104132302_sw01_invited_counselor_access", "20261104144015_sw03_academic_upload_validation",
    "20261105030355_sw02_versioned_contracts", "20261105081447_sw15_processing_budget",
    "20261106110326_sw06_extraction_drafts_cleanup", "20261106124126_sw07_reviewed_profile_approval",
    "20261106132602_sw08_restricted_correction_logs", "20261106140122_sw23_retention_cleanup_restore", "20261107105108_sw21_report_review",
    "20261107112111_sw24_reliable_termination"]) {
    // Test-only clock replacement; production has no time override.
    await db.exec(migration(name).replaceAll("clock_timestamp()", "public.sw23_test_clock()")
      .replaceAll("statement_timestamp()", "public.sw23_test_clock()"));
  }
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec("truncate sessions, report_versions, report_artifact_cleanup, extraction_artifact_cleanup, correction_logs, retention_tombstones, session_termination_requests cascade");
  await clock("2026-11-05T00:04:00Z");
});

async function seed() {
  const id = (await db.query<{ id: string }>(`insert into sessions(counselor_id,created_at,approved_profile,
    current_profile_version,current_report_version,current_run_id) values ($1,$2,'{"notes":"PRIVATE"}',1,1,gen_random_uuid()) returning id`, [owner, created])).rows[0].id;
  await db.query(`insert into session_notes(session_id,counselor_id,career_goal) values ($1,$2,'PRIVATE')`, [id, owner]);
  await db.query(`insert into extraction_results(session_id,counselor_id,document_type,structured_data,redacted_image_path)
    values ($1,$2,'nat','{}',$3)`, [id, owner, `${id}/legacy.jpg`]);
  await db.query(`insert into profile_versions values ($1,1,$2,'{"notes":"PRIVATE"}',$3,$3)`, [id, owner, created]);
  await db.query(`insert into report_versions(session_id,report_version,counselor_id,approved_profile_version,run_id,object_key,generated_at,expires_at,status,approved_at) select id,1,counselor_id,1,current_run_id,
    id::text||'/1.pdf','2026-11-05T00:04:00Z','2026-11-06T00:04:00Z','approved','2026-11-05T00:05:00Z'
    from sessions where id=$1`, [id]);
  await db.query(`insert into correction_logs(session_id,field_name,extracted_value,corrected_value)
    values ($1,'ncae.overall_percentile','80','81')`, [id]);
  return id;
}
const purge = (id: string) => db.query("select purge_session_content($1)", [id]);
async function count(table: string) { return Number((await db.query<{ n: number }>(`select count(*)::integer n from ${table}`)).rows[0].n); }

it("S04 expires draft at creation+24h regardless of activity while retaining approved PDF authorization", async () => {
  const id = await seed();
  await db.query("update sessions set last_activity=$2 where id=$1", [id, "2026-11-05T23:59:59Z"]);
  await clock("2026-11-05T23:59:59.999Z");
  await expect(purge(id)).rejects.toThrow(/not expired/);
  await clock(draftExpiry);
  await purge(id); await purge(id);
  for (const table of ["session_notes", "profile_versions", "analysis_runs", "extraction_results", "ranked_recommendations"]) expect(await count(table), table).toBe(0);
  const s = (await db.query<Record<string, unknown>>("select * from sessions where id=$1", [id])).rows[0];
  expect(s).toMatchObject({ status: "expired", approved_profile: null, module_status: {}, current_report_version: 1 });
  expect(await count("report_versions")).toBe(1);
  expect(await count("report_artifact_cleanup")).toBe(0);
  expect(await count("extraction_artifact_cleanup")).toBe(1);
  expect(await count("correction_logs")).toBe(1);
  await clock("2026-11-06T00:03:59.999Z");
  await db.exec("select prepare_report_retention()");
  expect(await count("report_versions")).toBe(1);
  await clock(pdfExpiry);
  await db.exec("select prepare_report_retention(); select prepare_report_retention()");
  expect(await count("report_versions")).toBe(0);
  expect(await count("sessions")).toBe(0);
  expect(await count("report_artifact_cleanup")).toBe(1);
  // Correction policy survives independently until its original calendar deadline.
  await clock("2027-11-04T23:59:59.999Z");
  await db.exec("select purge_expired_correction_logs()");
  expect(await count("correction_logs")).toBe(1);
  await clock("2027-11-05T00:00:00Z");
  await db.exec("select purge_expired_correction_logs(); select purge_expired_correction_logs()");
  expect(await count("correction_logs")).toBe(0);
});

it("S10 replays a post-backup termination ledger before expiry on a restored snapshot", async () => {
  const id = await seed();
  const snapshots = Object.fromEntries(await Promise.all(["sessions", "report_versions", "session_notes"].map(async table =>
    [table, (await db.query(`select * from ${table}`)).rows])));
  await db.query("update sessions set status='cancelled' where id=$1", [id]);
  const ledger = (await db.query("select * from retention_tombstones")).rows;
  await purge(id);
  expect(await count("sessions")).toBe(0);
  // Backup predates cancellation and contains valid clocks and approval.
  await db.exec("truncate report_versions, retention_tombstones, report_artifact_cleanup cascade");
  for (const table of ["sessions", "report_versions", "session_notes"]) {
    await db.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1)`, [JSON.stringify(snapshots[table])]);
  }
  await db.query("select reapply_retention_tombstones($1)", [JSON.stringify(ledger)]);
  expect((await db.query<{ status: string }>("select status from sessions where id=$1", [id])).rows[0].status).toBe("cancelled");
  expect(await count("report_versions")).toBe(0);
  await purge(id); await purge(id);
  expect(await count("sessions")).toBe(0);
  expect(await count("report_artifact_cleanup")).toBe(1);
});

it("S10 removes expired restored content and preserves a valid owner draft", async () => {
  const expired = await seed();
  await clock("2026-11-07T00:00:00Z");
  const valid = (await db.query<{ id: string }>("insert into sessions(counselor_id,created_at) values ($1,'2026-11-06T23:00:00Z') returning id", [owner])).rows[0].id;
  await db.query("select reapply_retention_tombstones('[]')");
  await purge(expired);
  expect(await count("report_versions")).toBe(0);
  expect((await db.query("select id from sessions")).rows).toEqual([{ id: valid }]);
});

it("keeps cancellation durable and payload cleanup retryable when a database deletion fails", async () => {
  const id = await seed();
  await db.query("update sessions set status='cancelled' where id=$1", [id]);
  await db.exec(`create function fail_retention_test() returns trigger language plpgsql as $$ begin raise exception 'fault'; end $$;
    create trigger fault before delete on session_notes for each row execute function fail_retention_test();`);
  await expect(purge(id)).rejects.toThrow(/fault/);
  expect(await count("retention_tombstones")).toBe(1);
  expect(await count("report_versions")).toBe(1); // Atomic rollback keeps the retry reference.
  expect((await db.query<{ status: string }>("select status from sessions")).rows[0].status).toBe("cancelled");
  await db.exec("drop trigger fault on session_notes; drop function fail_retention_test()");
  await purge(id);
  expect(await count("report_versions")).toBe(0);
  expect(await count("report_artifact_cleanup")).toBe(1);
});

it("leases cleanup exclusively, recovers killed workers and preserves minimum failed-deletion state", async () => {
  const id = await seed();
  await db.query("update sessions set status='cancelled' where id=$1", [id]); await purge(id);
  const first = (await db.query<{ lease_token: string; attempts: number }>("select * from claim_report_cleanup(50)")).rows[0];
  expect(first.attempts).toBe(1);
  expect((await db.query("select * from claim_report_cleanup(50)")).rows).toHaveLength(0);
  await clock("2026-11-05T00:09:00Z");
  const retry = (await db.query<{ lease_token: string; attempts: number }>("select * from claim_report_cleanup(50)")).rows[0];
  expect(retry.attempts).toBe(2); expect(retry.lease_token).not.toBe(first.lease_token);
  expect((await db.query("delete from report_artifact_cleanup where lease_token=$1 returning *", [first.lease_token])).rows).toHaveLength(0);
  await db.query("delete from report_artifact_cleanup where lease_token=$1", [retry.lease_token]);
  expect((await db.query<{ report_cleanup_pending: boolean }>("select report_cleanup_pending()")).rows[0].report_cleanup_pending).toBe(false);
});

it("denies counselor and anonymous lifecycle/ledger access", async () => {
  for (const role of ["anon", "authenticated"]) for (const sql of ["select * from retention_tombstones", "select * from report_artifact_cleanup", "select prepare_report_retention()", "select reapply_retention_tombstones('[]')", "select * from claim_report_cleanup(50)", "select * from session_termination_requests", "select * from pending_session_terminations(50)", "select begin_session_termination(gen_random_uuid(),gen_random_uuid())", "select session_termination_state(gen_random_uuid(),true)"]) {
    await db.exec(`set role ${role}`);
    await expect(db.exec(sql)).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  }
});

it("inventories legacy images even after their extraction/session references are lost", async () => {
  await db.exec("insert into storage.objects(bucket_id,name) values ('kumpas-documents','orphan/image.jpg'),('other','keep.jpg')");
  await db.exec("select queue_legacy_document_cleanup(); select queue_legacy_document_cleanup()");
  expect((await db.query("select object_path from extraction_artifact_cleanup")).rows).toEqual([{ object_path: "orphan/image.jpg" }]);
  await db.exec("delete from storage.objects");
});


it("SW-24 keeps retries owner-bound after deletion and finishes only after all queued files are removed", async () => {
  const id = await seed();
  const begin = async (who = owner) => (await db.query<{ ok: boolean }>("select begin_session_termination($1,$2) ok", [id, who])).rows[0].ok;
  const state = async (inventory: boolean | null = null) => (await db.query<{ state: { cleanupPending: boolean; reportPdfPurged: boolean } }>("select session_termination_state($1,$2) state", [id, inventory])).rows[0].state;
  expect(await begin("22222222-2222-4222-8222-222222222222")).toBe(false);
  expect((await db.query("select status from sessions where id=$1", [id])).rows[0]).toEqual({ status: "active" });
  expect(await begin()).toBe(true);
  await purge(id);
  expect(await count("sessions")).toBe(0);
  expect(await count("correction_logs")).toBe(1);
  expect(await state()).toMatchObject({ cleanupPending: true, reportPdfPurged: false });
  expect((await db.query("select * from pending_session_terminations(50)")).rows).toEqual([{ id }]);
  expect(await begin()).toBe(true);
  expect(await begin("22222222-2222-4222-8222-222222222222")).toBe(false);
  // A failed Storage delete retains its leased/backoff object reference.
  await db.exec("update report_artifact_cleanup set last_error='storage_delete_failed', next_attempt_at='2026-11-05T01:00:00Z'");
  expect((await state(true)).cleanupPending).toBe(true);
  await db.exec("delete from report_artifact_cleanup; delete from extraction_artifact_cleanup");
  expect(await state()).toEqual({ cleanupPending: false, reportPdfPurged: true });
  expect((await db.query("select * from pending_session_terminations(50)")).rows).toEqual([]);
  expect(await begin()).toBe(true);
});

it("SW-24 retains failed inventory after parent purge and scopes completion to this session", async () => {
  const id = await seed();
  await db.query("select begin_session_termination($1,$2)", [id, owner]);
  await purge(id);
  await db.exec("delete from report_artifact_cleanup; delete from extraction_artifact_cleanup");
  expect((await db.query<{ state: { cleanupPending: boolean } }>("select session_termination_state($1,false) state", [id])).rows[0].state.cleanupPending).toBe(true);
  await db.query("insert into report_artifact_cleanup(object_key) values ('another-session/1.pdf')");
  expect((await db.query<{ state: unknown }>("select session_termination_state($1,true) state", [id])).rows[0].state).toEqual({ cleanupPending: false, reportPdfPurged: true });
});

it("SW-24 blocks late analysis publication, PDF completion and delivery immediately on termination", async () => {
  const id = await seed();
  const run = (await db.query<{ current_run_id: string }>("select current_run_id from sessions where id=$1", [id])).rows[0].current_run_id;
  await db.query("insert into analysis_runs(run_id,session_id,approved_profile_version,counselor_id,analysis_started_at,deadline_at) values ($1,$2,1,$3,'2026-11-05T00:03:00Z','2026-11-05T00:08:00Z')", [run,id,owner]);
  await db.query("select begin_session_termination($1,$2)", [id,owner]);
  for (const action of ["analysis_ready", "report_ready"]) {
    await expect(db.query("select transition_processing_run($1,$2,$3,1,$4,'{}',null)", [id,owner,run,action])).rejects.toThrow(/unavailable/);
  }
  await expect(db.query("select complete_report_delivery($1,$2,1,1,$3)", [id,owner,run])).rejects.toThrow(/unavailable/);
  expect((await db.query("select approved_profile,status from sessions where id=$1", [id])).rows[0]).toEqual({ approved_profile: null, status: "cancelled" });
  await purge(id);
  expect(await count("analysis_runs")).toBe(0);
});

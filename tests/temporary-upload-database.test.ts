import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const authSession = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const otherAuthSession = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
type Upload = { id: string; object_path: string; extraction_id: string; upload_token: string; state: string };

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}',
      invited_at timestamptz, email_confirmed_at timestamptz, is_anonymous boolean default false,
      banned_until timestamptz, deleted_at timestamptz);
    create table auth.sessions(id uuid primary key, user_id uuid, not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    grant all on storage.objects to anon, authenticated, service_role;`);
  for (const name of ["20260523000000_module2_sessions", "20260523000001_module2_grants",
    "20260523000002_module3_recommendations", "20260524000000_create_profiles",
    "20260524000001_tighten_session_security", "20260524000002_module5_session_progress",
    "20261104132302_sw01_invited_counselor_access", "20261104144015_sw03_academic_upload_validation",
    "20261105030355_sw02_versioned_contracts", "20261105081447_sw15_processing_budget",
    "20261106110326_sw06_extraction_drafts_cleanup", "20261106124126_sw07_reviewed_profile_approval",
    "20261106132602_sw08_restricted_correction_logs", "20261106140122_sw23_retention_cleanup_restore",
    "20261108091527_sw30_temporary_intake_uploads"]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
  }
  await db.exec(`insert into auth.users(id,invited_at,email_confirmed_at,raw_app_meta_data) values
    ('${owner}',now(),now(),'{"role":"counselor","counselor_activated":true}'),
    ('${other}',now(),now(),'{"role":"counselor","counselor_activated":true}');
    insert into auth.sessions values ('${authSession}','${owner}',null);
    insert into auth.sessions values ('${otherAuthSession}','${other}',null);
    -- The restrictive guard must win even with a permissive historical policy.
    create policy legacy_storage_policy on storage.objects for all to anon,authenticated using(true) with check(true);`);
}, 30_000);
afterAll(() => db.close());
beforeEach(async () => { await db.exec("truncate sessions, extraction_artifact_cleanup, storage.objects cascade"); });
async function session() {
  const id = (await db.query<{ id: string }>("insert into sessions(counselor_id) values ($1) returning id", [owner])).rows[0].id;
  await db.query("insert into session_notes(session_id,counselor_id) values ($1,$2)", [id, owner]);
  return id;
}
async function prepare(id: string, doc = "nat", size = 10_000_000, counselor = owner) {
  return (await db.query<Upload>("select * from prepare_temporary_upload($1,$2,$3,$4,'image/png',null,$5)",
    [id, counselor, doc, size, doc === "notes" ? 0 : null])).rows[0];
}
const store = (u: Upload) => db.query("insert into storage.objects(bucket_id,name) values ('kumpas-intake-temp',$1)", [u.object_path]);
const claim = (id: string, u: Upload, counselor = owner) => db.query<Upload>("select * from claim_temporary_upload($1,$2,$3)", [id, counselor, u.id]);
const finish = (id: string, u: Upload) => db.query("select finish_temporary_upload($1,$2,$3)", [id, owner, u.id]);
async function asUser<T>(id: string | null, work: () => Promise<T>) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, session_id: id === other ? otherAuthSession : authSession, exp: 4102444800 })]);
    await db.exec(`set local role ${id ? "authenticated" : "anon"}`);
    return await work();
  } finally { await db.exec("rollback"); }
}

it("registers cleanup before authorization, accepts the exact boundary and rejects oversized/foreign reservations", async () => {
  const id = await session();
  const u = await prepare(id);
  expect((await db.query("select * from extraction_artifact_cleanup where id=$1", [u.id])).rows).toHaveLength(1);
  expect((await db.query<{ pending: boolean }>("select extraction_cleanup_pending() as pending")).rows[0].pending).toBe(false);
  await expect(prepare(id, "form_137", 10_000_001)).rejects.toThrow("Invalid upload");
  await expect(prepare(id, "form_137", 1, other)).rejects.toThrow("Session unavailable");
  await expect(prepare(id)).rejects.toThrow(/in progress/);
});

it("allows insert only to a live owned reservation and denies reads, overwrites, arbitrary paths and browser RPCs", async () => {
  const id = await session(), u = await prepare(id);
  await asUser(owner, () => store(u));
  await expect(asUser(other, () => store(u))).rejects.toThrow();
  await expect(asUser(null, () => store(u))).rejects.toThrow();
  await expect(asUser(owner, () => store({ ...u, object_path: `${id}/arbitrary` }))).rejects.toThrow();
  await store(u);
  await asUser(owner, async () => {
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(0);
    expect((await db.query("update storage.objects set name='overwritten' returning id")).rows).toHaveLength(0);
    expect((await db.query("delete from storage.objects returning id")).rows).toHaveLength(0);
  });
  await expect(asUser(owner, () => claim(id, u))).rejects.toThrow(/permission denied/);
  await db.query("update temporary_intake_uploads set expires_at=now()-interval '1 second' where id=$1", [u.id]);
  await expect(asUser(owner, () => store(u))).rejects.toThrow();
});

it("consumes a completed upload once, blocks replay and preserves its raw object until cleanup succeeds", async () => {
  const id = await session(), u = await prepare(id);
  await expect(claim(id, u)).rejects.toThrow(/incomplete/);
  await store(u);
  await expect(claim(id, u, other)).rejects.toThrow(/unavailable/);
  expect((await claim(id, u)).rows[0].state).toBe("processing");
  await expect(claim(id, u)).rejects.toThrow(/already processing/);
  await expect(asUser(owner, () => store(u))).rejects.toThrow();
  await finish(id, u); await finish(id, u);
  expect((await db.query("select * from extraction_results where session_id=$1", [id])).rows).toHaveLength(0);
  expect((await db.query("select * from temporary_intake_uploads where id=$1", [u.id])).rows).toHaveLength(1);
  expect((await db.query("select * from claim_extraction_cleanup(10,null)")).rows).toHaveLength(0);
  const leased = await db.query<{ id: string }>("select * from claim_intake_cleanup(10,null)");
  expect(leased.rows.map(x => x.id)).toContain(u.id);
  await db.query("delete from extraction_artifact_cleanup where id=$1", [u.id]);
  expect((await db.query("select * from temporary_intake_uploads where id=$1", [u.id])).rows).toHaveLength(0);
});

it("reclaims abandoned claims and cancelled/deleted sessions while protecting active uploads", async () => {
  const id = await session(), u = await prepare(id);
  await db.exec("select queue_temporary_upload_cleanup()");
  expect((await db.query<{ state: string }>("select state from temporary_intake_uploads where id=$1", [u.id])).rows[0].state).toBe("pending");
  await db.query("update temporary_intake_uploads set expires_at=now()-interval '1 second' where id=$1", [u.id]);
  await db.exec("select queue_temporary_upload_cleanup()");
  expect((await db.query("select * from extraction_results where session_id=$1", [id])).rows).toHaveLength(0);
  const current = await prepare(id);
  await db.query("update sessions set status='cancelled' where id=$1", [id]);
  await db.exec("select queue_temporary_upload_cleanup()");
  expect((await db.query<{ state: string }>("select state from temporary_intake_uploads where id=$1", [current.id])).rows[0].state).toBe("cleanup");
  await db.query("delete from sessions where id=$1", [id]);
  expect((await db.query("select * from extraction_artifact_cleanup")).rows).toHaveLength(2);
});

it("reserves notes by revision, blocks approval while staging and rejects stale notes before processing", async () => {
  const id = await session(), u = await prepare(id, "notes", 100);
  await expect(prepare(id, "notes", 100)).rejects.toThrow(/in progress/);
  expect((await db.query<{ draft: { uploadPending: boolean } }>("select read_intake_draft($1,$2) draft", [id, owner])).rows[0].draft.uploadPending).toBe(true);
  await store(u);
  await db.query("update session_notes set draft_revision=1 where session_id=$1", [id]);
  await expect(claim(id, u)).rejects.toThrow("Notes changed");
  await finish(id, u);
  expect((await db.query<{ draft: { uploadPending: boolean } }>("select read_intake_draft($1,$2) draft", [id, owner])).rows[0].draft.uploadPending).toBe(false);
});

it("finds orphaned raw objects and keeps internal mutation RPCs unavailable to browser roles", async () => {
  const id = await session();
  await db.query("insert into storage.objects(bucket_id,name) values ('kumpas-intake-temp',$1)", [`${id}/orphan`]);
  await db.exec("select queue_temporary_upload_cleanup(); select queue_temporary_upload_cleanup()");
  expect((await db.query("select * from extraction_artifact_cleanup where bucket_id='kumpas-intake-temp'")).rows).toHaveLength(1);
  const functions = await db.query<{ count: number }>(`select count(*)::int count from pg_proc where proname in
    ('prepare_temporary_upload','claim_temporary_upload','finish_temporary_upload','queue_temporary_upload_cleanup')
    and (prosecdef or has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute'))`);
  expect(functions.rows[0].count).toBe(0);
});

it("never deletes raw-upload tracking before its abandoned document reservation has been released", async () => {
  await db.exec(`insert into sessions(counselor_id) select '${owner}'::uuid from generate_series(1,101);
    select prepare_temporary_upload(id,counselor_id,'nat',1,'image/png') from sessions;
    update temporary_intake_uploads set expires_at=now()-interval '1 minute';
    update extraction_results set upload_expires_at=now()-interval '1 minute';
    update extraction_artifact_cleanup set next_attempt_at=now()-interval '1 minute';
    select queue_temporary_upload_cleanup();`);
  // The inventory sweep releases at most 100 reservations per invocation. The
  // remaining expired queue entry is older than the entries just made ready.
  const claimed = (await db.query<{ id: string }>("select * from claim_intake_cleanup(100,null)")).rows;
  expect(claimed).toHaveLength(100);
  for (const { id } of claimed) {
    const row = (await db.query<{ state: string }>("select state from temporary_intake_uploads where id=$1", [id])).rows[0];
    expect(row.state).toBe("cleanup");
  }
  await db.exec("delete from extraction_artifact_cleanup where lease_token is not null; select queue_temporary_upload_cleanup()");
  expect((await db.query("select * from extraction_results")).rows).toHaveLength(0);
  expect((await db.query("select * from claim_intake_cleanup(100,null)")).rows).toHaveLength(1);
});

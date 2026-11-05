import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const sa = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sb = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ra = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const authSession = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const migration = (file: string) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");

beforeAll(async () => {
  // Only Supabase-managed Auth/Storage schemas are fixtures. Application tables,
  // grants and policies below are loaded from the repository's actual migrations.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}',
      invited_at timestamptz, email_confirmed_at timestamptz, is_anonymous boolean default false,
      banned_until timestamptz, deleted_at timestamptz
    );
    create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id), not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    grant all on storage.objects to anon, authenticated, service_role;
  `);
  for (const file of [
    "20260523000000_module2_sessions.sql", "20260523000001_module2_grants.sql",
    "20260523000002_module3_recommendations.sql", "20260524000000_create_profiles.sql",
    "20260524000001_tighten_session_security.sql", "20260524000002_module5_session_progress.sql",
    "20261104132302_sw01_invited_counselor_access.sql",
  ]) await db.exec(migration(file));
  await db.exec(`
    insert into auth.users(id, invited_at, email_confirmed_at, raw_app_meta_data) values
      ('${a}', now(), now(), '{"role":"counselor","counselor_activated":true}'),
      ('${b}', now(), now(), '{"role":"counselor","counselor_activated":true}');
    insert into auth.sessions values ('${authSession}', '${a}', null);
    insert into public.sessions(id, counselor_id) values ('${sa}', '${a}'), ('${sb}', '${b}');
    insert into public.session_notes(session_id, counselor_id, career_goal) values
      ('${sa}', '${a}', 'owner A'), ('${sb}', '${b}', 'owner B'),
      ('${sa}', '${b}', 'forged child counselor');
    insert into public.extraction_results(session_id, counselor_id, document_type, structured_data) values
      ('${sa}', '${a}', 'nat', '{}'), ('${sb}', '${b}', 'nat', '{}'), ('${sa}', '${b}', 'nat', '{}');
    insert into public.ranked_recommendations(id, session_id, rank, career_path, alignment_score,
      aptitude_fit, market_demand, financial_feasibility, reasoning_summary) values
      ('${ra}', '${sa}', 1, 'synthetic career', 0.5, 0.5, 0.5, 0.5, 'synthetic evidence');
    insert into public.recommendation_sources(recommendation_id, title, reference, acquisition_method)
      values ('${ra}', 'synthetic source', 'test-only', 'test');
    insert into public.correction_logs(session_id, field_name, corrected_value) values ('${sa}', 'grade', '80');
    insert into storage.objects(bucket_id, name) values
      ('kumpas-documents', '${sa}/document.jpg'), ('kumpas-documents', '${sb}/document.jpg'),
      ('kumpas-reports', '${sa}/${sa}.pdf'), ('kumpas-reports', '${sb}/${sb}.pdf');
    -- Simulate a legacy overly broad policy: the new restrictive guard must win.
    create policy old_permissive_storage_policy on storage.objects for all to anon, authenticated
      using (true) with check (true);
  `);
}, 30000);
afterAll(async () => { await db.close(); });

async function asUser<T>(userId: string | null, work: () => Promise<T>, exp = 4102444800): Promise<T> {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, session_id: authSession, exp })]);
    await db.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    return await work();
  } finally { await db.exec("rollback"); }
}
async function count(table: string) {
  return Number((await db.query<{ count: string }>(`select count(*) from ${table}`)).rows[0].count);
}
describe("I03 PostgreSQL row and private storage isolation", () => {
  it("the owner can read only its session and matching child rows", async () => {
    await asUser(a, async () => {
      for (const table of ["sessions", "session_notes", "extraction_results", "ranked_recommendations", "recommendation_sources", "profiles"]) {
        expect(await count(`public.${table}`), table).toBe(1);
      }
      // Even owners use the authenticated app endpoints, never bearer URL signing.
      expect(await count("storage.objects")).toBe(0);
      expect((await db.query("select public.counselor_access() as access")).rows).toEqual([{ access: "active" }]);
    });
  });
  it("a second counselor cannot read A's parent, child, analysis or storage rows, even with forged child ownership", async () => {
    await db.exec("begin");
    try {
      await db.exec(`update auth.sessions set user_id = '${b}' where id = '${authSession}'`);
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: b, session_id: authSession, exp: 4102444800 })]);
      await db.exec("set local role authenticated");
      expect(await count("public.sessions")).toBe(1);
      expect(await count("public.session_notes")).toBe(1);
      expect(await count("public.extraction_results")).toBe(1);
      expect(await count("public.ranked_recommendations")).toBe(0);
      expect(await count("public.recommendation_sources")).toBe(0);
      expect(await count("storage.objects")).toBe(0);
    } finally { await db.exec("rollback"); }
  });
  for (const [name, update] of [
    ["uninvited signup", "invited_at = null"],
    ["unactivated invitation", "raw_app_meta_data = '{\"role\":\"counselor\"}'"],
    ["wrong role", "raw_app_meta_data = '{\"role\":\"student\",\"counselor_activated\":true}'"],
    ["user-editable counselor claim", "raw_app_meta_data = '{}', raw_user_meta_data = '{\"role\":\"counselor\",\"counselor_activated\":true}'"],
    ["banned account", "banned_until = now() + interval '1 day'"],
  ]) {
    it(`${name} cannot read any session or private object`, async () => {
      await db.exec("begin");
      try {
        await db.exec(`update auth.users set ${update} where id = '${a}'`);
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: a, session_id: authSession, exp: 4102444800 })]);
        await db.exec("set local role authenticated");
        for (const table of ["public.sessions", "public.session_notes", "public.extraction_results", "public.ranked_recommendations", "storage.objects"]) {
          expect(await count(table), table).toBe(0);
        }
      } finally { await db.exec("rollback"); }
    });
  }
  it("expired JWT claims grant no rows or objects", async () => {
    await asUser(a, async () => {
      expect(await count("public.sessions")).toBe(0);
      expect(await count("public.session_notes")).toBe(0);
      expect(await count("storage.objects")).toBe(0);
    }, 1);
  });
  it("missing identity cannot read rows or private objects", async () => {
    await asUser(null, async () => { expect(await count("storage.objects")).toBe(0); });
    await expect(asUser(null, () => count("public.sessions"))).rejects.toThrow(/permission denied/);
  });
  it("a signed-out session cannot replay an unexpired JWT", async () => {
    await db.exec("begin");
    try {
      await db.exec("delete from auth.sessions");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: a, session_id: authSession, exp: 4102444800 })]);
      await db.exec("set local role authenticated");
      expect(await count("public.sessions")).toBe(0);
      expect(await count("storage.objects")).toBe(0);
    } finally { await db.exec("rollback"); }
  });
  for (const state of ["expires_at = now() - interval '1 second'", "status = 'cancelled'"]) {
    it(`ineligible session (${state}) denies private artifacts immediately`, async () => {
      await db.exec("begin");
      try {
        await db.exec(`update public.sessions set ${state} where id = '${sa}'`);
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: a, session_id: authSession, exp: 4102444800 })]);
        await db.exec("set local role authenticated");
        expect(await count("public.sessions")).toBe(0);
        expect(await count("storage.objects")).toBe(0);
      } finally { await db.exec("rollback"); }
    });
  }
  for (const sql of [
    `update public.sessions set counselor_id = '${b}' where id = '${sa}'`,
    `update public.sessions set expires_at = now() + interval '10 years' where id = '${sa}'`,
    `insert into public.session_notes(session_id, counselor_id) values ('${sb}', '${a}')`,
    `select * from public.correction_logs`,
    `update public.profiles set id = '${b}' where id = '${a}'`,
    `insert into storage.objects(bucket_id,name) values ('kumpas-documents','${sa}/forged.jpg')`,
  ]) {
    it(`client mutation/access is denied: ${sql}`, async () => {
      await expect(asUser(a, () => db.query(sql))).rejects.toThrow(/permission denied|row-level security/);
    });
  }
  it("client storage deletes are denied even by an old permissive policy", async () => {
    await asUser(a, async () => {
      const result = await db.query("delete from storage.objects returning id");
      expect(result.rows).toEqual([]);
    });
  });
  it("both artifact buckets remain private", async () => {
    expect((await db.query("select public from storage.buckets where id in ('kumpas-reports','kumpas-documents')")).rows)
      .toEqual([{ public: false }, { public: false }]);
  });
});

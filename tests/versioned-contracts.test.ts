import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isBeforeExpiry, isCurrentRun, type SessionVersionContract, type AnalysisRunContract } from "@/lib/module5/versioned-contracts";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const migration = readFileSync(new URL("../supabase/migrations/20261105030355_sw02_versioned_contracts.sql", import.meta.url), "utf8");
const baseline = readFileSync(new URL("../supabase/migrations/20260523000000_module2_sessions.sql", import.meta.url), "utf8");
const legacy = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text);`);
  await db.exec(baseline);
  await db.exec(`grant all on public.sessions to service_role;
    insert into public.sessions(id, counselor_id, approved_profile, created_at, expires_at)
    values ('${legacy}', '${owner}', '{"legacy":true}', '2026-01-01T00:00:00Z', '2030-01-01T00:00:00Z');`);
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db.close(); });

async function session() {
  return (await db.query<{ id: string }>("insert into public.sessions(counselor_id) values ($1) returning id", [owner])).rows[0].id;
}
async function save(id: string, version = 0, approve = true, counselor = owner) {
  return (await db.query<Record<string, unknown>>("select * from public.save_profile_version($1,$2,$3,$4,$5)", [id, counselor, version, { academicData: { mathematics: 87 } }, approve])).rows[0];
}
async function start(id: string, version = 1, expectedRun: string | null = null) {
  return (await db.query<{ run_id: string }>("select * from public.start_analysis_run($1,$2,$3,$4)", [id, owner, version, expectedRun])).rows[0];
}
async function publish(id: string, run: string, version = 1, report = 0) {
  return (await db.query<Record<string, unknown>>("select * from public.publish_report_version($1,$2,$3,$4,$5)", [id, owner, version, run, report])).rows[0];
}
async function review(id: string, decision = "approved", profile = 1, report = 1) {
  return (await db.query<Record<string, unknown>>("select * from public.review_report_version($1,$2,$3,$4,$5)", [id, owner, profile, report, decision])).rows[0];
}

describe("SW-02 database version transitions", () => {
  it("retains legacy payloads without inventing approval and repairs expiry from creation", async () => {
    const { rows } = await db.query<Record<string, unknown>>(`select current_profile_version, current_report_version, current_run_id,
      approved_profile, expires_at = created_at + interval '24 hours' as fixed from public.sessions where id = $1`, [legacy]);
    expect(rows[0]).toEqual({ current_profile_version: 0, current_report_version: 0, current_run_id: null, approved_profile: { legacy: true }, fixed: true });
    expect((await db.query<Record<string, unknown>>("select * from public.profile_versions")).rows).toHaveLength(0);
  });
  it("uses fixed UTC hours even across DST, activity and attempted expiry changes", async () => {
    await db.exec("set timezone = 'America/New_York'");
    const id = (await db.query<{ id: string }>(`insert into public.sessions(counselor_id, created_at)
      values ($1, '2026-11-01T04:00:00Z') returning id`, [owner])).rows[0].id;
    await db.query<Record<string, unknown>>("update public.sessions set last_activity = now(), expires_at = now() + interval '5 days' where id = $1", [id]);
    expect((await db.query<Record<string, unknown>>("select extract(epoch from expires_at-created_at)::integer as seconds from public.sessions where id=$1", [id])).rows[0].seconds).toBe(86400);
    await expect(db.query<Record<string, unknown>>("update public.sessions set created_at=now() where id=$1", [id])).rejects.toThrow(/immutable/);
    await expect(db.query<Record<string, unknown>>("update public.sessions set counselor_id=$2 where id=$1", [id, other])).rejects.toThrow(/immutable/);
    await db.exec("set timezone = 'UTC'");
  });
  it("requires explicit approval and preserves immutable versions", async () => {
    const id = await session();
    const draft = await save(id, 0, false);
    expect(draft.approved_at).toBeNull();
    await expect(start(id)).rejects.toThrow(/approval required/);
    const approved = await save(id, 1);
    expect(approved.approved_at).not.toBeNull();
    expect(approved.profile_version).toBe(2);
    await expect(db.query<Record<string, unknown>>("update public.profile_versions set profile='{}' where session_id=$1", [id])).rejects.toThrow(/immutable/);
    expect((await db.query<Record<string, unknown>>("select * from public.profile_versions where session_id=$1", [id])).rows).toHaveLength(2);
  });
  it("rejects stale/null versions, wrong owners, expired and cancelled sessions", async () => {
    const id = await session();
    await save(id);
    await expect(save(id)).rejects.toThrow(/Stale/);
    await expect(save(id, 1, true, other)).rejects.toThrow(/unavailable/);
    await expect(db.query<Record<string, unknown>>("select public.save_profile_version($1,$2,null,'{}',true)", [id, owner])).rejects.toThrow(/Stale/);
    await db.query<Record<string, unknown>>("update public.sessions set status='cancelled' where id=$1", [id]);
    await expect(save(id, 1)).rejects.toThrow(/unavailable/);
    await expect(save(legacy)).rejects.toThrow(/unavailable/);
  });
  it("allows only one competing profile write and run start per expected token", async () => {
    const id = await session();
    const profiles = await Promise.allSettled([save(id), save(id)]);
    expect(profiles.filter(x => x.status === "fulfilled")).toHaveLength(1);
    const runs = await Promise.allSettled([start(id), start(id)]);
    expect(runs.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect((await db.query<Record<string, unknown>>("select extract(epoch from deadline_at-analysis_started_at)::integer as seconds from public.analysis_runs where session_id=$1", [id])).rows[0].seconds).toBe(300);
  });
  it("invalidates old runs and approvals on correction; late completions cannot publish", async () => {
    const id = await session(); await save(id);
    const run = await start(id); await publish(id, run.run_id); await review(id);
    await save(id, 1, false);
    await expect(publish(id, run.run_id, 1, 1)).rejects.toThrow(/Stale/);
    await expect(review(id)).rejects.toThrow(/Stale/);
    expect((await db.query<Record<string, unknown>>("select status,approved_at from public.report_versions where session_id=$1", [id])).rows[0]).toEqual({ status: "out_of_date", approved_at: null });
    expect((await db.query<Record<string, unknown>>("select status from public.analysis_runs where run_id=$1", [run.run_id])).rows[0].status).toBe("superseded");
  });
  it("run replacement rejects old completion and duplicate report publication", async () => {
    const id = await session(); await save(id);
    const old = await start(id); const current = await start(id, 1, old.run_id);
    await expect(publish(id, old.run_id)).rejects.toThrow(/Stale/);
    const results = await Promise.allSettled([publish(id, current.run_id), publish(id, current.run_id)]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect((await db.query<Record<string, unknown>>("select count(*)::integer as n from public.report_versions where session_id=$1", [id])).rows[0].n).toBe(1);
  });
  it("rejects completions at or beyond the run deadline", async () => {
    const id = await session(); await save(id); const run = await start(id);
    await db.query<Record<string, unknown>>(`update public.analysis_runs set analysis_started_at=statement_timestamp()-interval '300 seconds',
      deadline_at=statement_timestamp() where run_id=$1`, [run.run_id]);
    await expect(publish(id, run.run_id)).rejects.toThrow(/deadline elapsed/);
    expect((await db.query<Record<string, unknown>>("select current_report_version from public.sessions where id=$1", [id])).rows[0].current_report_version).toBe(0);
  });
  it("reviews the existing artifact once without changing its independent clock", async () => {
    const id = await session(); await save(id); const run = await start(id);
    const draft = await publish(id, run.run_id);
    expect(draft.status).toBe("draft");
    const results = await Promise.allSettled([review(id), review(id, "rejected")]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    const reviewed = (await db.query<Record<string, unknown>>("select * from public.report_versions where session_id=$1", [id])).rows[0];
    for (const field of ["object_key", "generated_at", "expires_at", "report_version"]) expect(reviewed[field]).toEqual(draft[field]);
    expect((await db.query<Record<string, unknown>>("select extract(epoch from expires_at-generated_at)::integer as seconds from public.report_versions where session_id=$1", [id])).rows[0].seconds).toBe(86400);
    await db.query<Record<string, unknown>>("delete from public.sessions where id=$1", [id]);
    expect((await db.query<Record<string, unknown>>("select * from public.profile_versions where session_id=$1", [id])).rows).toHaveLength(0);
    expect((await db.query<Record<string, unknown>>("select * from public.analysis_runs where session_id=$1", [id])).rows).toHaveLength(0);
    expect((await db.query<Record<string, unknown>>("select * from public.report_versions where session_id=$1", [id])).rows).toHaveLength(1);
  });
  it("keeps report versions monotonic and never carries approval into regeneration", async () => {
    const id = await session(); await save(id); const first = await start(id);
    await publish(id, first.run_id); await review(id);
    const second = await start(id, 1, first.run_id);
    const draft = await publish(id, second.run_id, 1, 1);
    expect(draft.report_version).toBe(2);
    expect(draft.status).toBe("draft"); expect(draft.approved_at).toBeNull();
    await expect(review(id)).rejects.toThrow(/Stale/);
    await review(id, "rejected", 1, 2);
    await expect(review(id, "approved", 1, 2)).rejects.toThrow(/already reviewed/);
  });
  it("rolls back invalidation if a later publication write fails", async () => {
    const id = await session(); await save(id); const run = await start(id);
    await db.exec(`create function public.test_fail_report() returns trigger language plpgsql as $$
      begin raise exception 'injected storage metadata failure'; end $$;
      create trigger test_fail_report before insert on public.report_versions
      for each row execute function public.test_fail_report();`);
    try { await expect(publish(id, run.run_id)).rejects.toThrow(/injected/); }
    finally { await db.exec("drop trigger test_fail_report on public.report_versions; drop function public.test_fail_report()"); }
    expect((await db.query<Record<string, unknown>>("select status from public.analysis_runs where run_id=$1", [run.run_id])).rows[0].status).toBe("running");
    expect((await db.query<Record<string, unknown>>("select current_report_version from public.sessions where id=$1", [id])).rows[0].current_report_version).toBe(0);
  });
  it("denies browser roles table access and transition execution", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query<Record<string, unknown>>("select * from public.profile_versions")).rejects.toThrow(/permission denied/);
        await expect(db.query<Record<string, unknown>>("select public.start_analysis_run($1,$2,1,null)", [legacy, owner])).rejects.toThrow(/permission denied/);
      } finally { await db.exec("reset role"); }
    }
    await db.exec("set role service_role");
    try {
      const id = await session(); await save(id); const run = await start(id); await publish(id, run.run_id);
      await expect(db.query<Record<string, unknown>>("update public.report_versions set generated_at=now(),expires_at=now()+interval '24 hours' where session_id=$1", [id])).rejects.toThrow(/permission denied/);
      await expect(db.query<Record<string, unknown>>("update public.analysis_runs set deadline_at=now() where run_id=$1", [run.run_id])).rejects.toThrow(/permission denied/);
    }
    finally { await db.exec("reset role"); }
  });
});

describe("S04 exact UTC access boundaries", () => {
  const created = Date.parse("2026-11-01T00:00:00Z");
  const draftExpiry = created + 86400000;
  const pdfExpiry = draftExpiry + 600000;
  it.each([-1, 0, 1])("checks each independent clock at boundary %+d ms", offset => {
    expect(isBeforeExpiry(new Date(draftExpiry).toISOString(), draftExpiry + offset)).toBe(offset < 0);
    expect(isBeforeExpiry(new Date(pdfExpiry).toISOString(), pdfExpiry + offset)).toBe(offset < 0);
    expect(isBeforeExpiry(new Date(pdfExpiry).toISOString(), draftExpiry)).toBe(true);
  });
  it("fails closed for invalid timestamps", () => {
    expect(isBeforeExpiry("invalid", created)).toBe(false);
    expect(isBeforeExpiry(new Date(pdfExpiry).toISOString(), NaN)).toBe(false);
  });
  it("checks owner, run and profile together and denies the exact deadline", () => {
    const s: SessionVersionContract = { sessionId: legacy, counselorId: owner, createdAt: new Date(created).toISOString(), expiresAt: new Date(draftExpiry).toISOString(), currentProfileVersion: 1, currentRunId: "run-1", currentReportVersion: 0 };
    const r: AnalysisRunContract = { sessionId: legacy, counselorId: owner, approvedProfileVersion: 1, runId: "run-1", analysisStartedAt: s.createdAt, deadlineAt: new Date(created + 300000).toISOString(), status: "running" };
    expect(isCurrentRun(s, r, created + 299999)).toBe(true);
    expect(isCurrentRun(s, r, created + 300000)).toBe(false);
    for (const patch of [{ counselorId: other }, { approvedProfileVersion: 2 }, { runId: "old" }, { status: "superseded" as const }]) expect(isCurrentRun(s, { ...r, ...patch }, created)).toBe(false);
  });
});

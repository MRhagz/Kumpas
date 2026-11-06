import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const profile = { counselorNotes: { careerGoal: "Undecided", interests: "Science" }, academicData: {} };
const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text);
    create table public.test_clock(t timestamptz); insert into public.test_clock values (clock_timestamp());
    create function public.test_wall_clock() returns timestamptz language sql as $$ select t from public.test_clock $$;`);
  await db.exec(migration("20260523000000_module2_sessions"));
  await db.exec(migration("20260524000002_module5_session_progress"));
  await db.exec(migration("20261105030355_sw02_versioned_contracts").replaceAll("clock_timestamp()", "public.test_wall_clock()"));
  await db.exec(migration("20261105081447_sw15_processing_budget").replaceAll("clock_timestamp()", "public.test_wall_clock()"));
  await db.exec("grant all on public.sessions to service_role; grant select on public.test_clock to service_role;");
}, 30000);
afterAll(async () => { await db.close(); });
type Row = Record<string, unknown> & { run_id: string; approved_profile_version: number; phase: string };
async function setup() {
  await db.exec("update public.test_clock set t=clock_timestamp()");
  const id = (await db.query<{ id: string }>("insert into public.sessions(counselor_id) values ($1) returning id", [owner])).rows[0].id;
  const run = (await db.query<Row>("select * from public.approve_and_start_analysis($1,$2,0,$3)", [id, owner, profile])).rows[0];
  return { id, run };
}
async function transition(id: string, run: Row, action: string, counselor = owner) {
  return (await db.query<Row>("select * from public.transition_processing_run($1,$2,$3,$4,$5,$6,$7)", [id, counselor, run.run_id, run.approved_profile_version, action,
    action === "analysis_ready" ? { sessionId: id, recommendations: [] } : null, "specialist analysis"])).rows[0];
}
async function advanceTo(id: string, run: Row, offset: number) {
  await db.query("update public.test_clock set t=(select deadline_at from public.analysis_runs where run_id=$1) + $2 * interval '1 millisecond'", [run.run_id, offset]);
}

describe("SW-15 durable deadline and stale completion guards", () => {
  it("atomically records approval, version, run and 300-second clock", async () => {
    const { id, run } = await setup();
    expect(run.phase).toBe("pending"); expect(run.approved_profile_version).toBe(1);
    expect(Date.parse(String(run.deadline_at)) - Date.parse(String(run.analysis_started_at))).toBe(300000);
    const saved = (await db.query<Record<string, unknown>>("select approved_profile,current_run_id,current_profile_version from public.sessions where id=$1", [id])).rows[0];
    expect(saved).toEqual({ approved_profile: profile, current_run_id: run.run_id, current_profile_version: 1 });
    await expect(db.query("select public.approve_and_start_analysis($1,$2,0,$3)", [id, owner, profile])).rejects.toThrow(/Stale/);
  });
  it("claims each stage once and only publishes after PDF storage", async () => {
    const { id, run } = await setup();
    const claims = await Promise.allSettled([transition(id, run, "claim_analysis"), transition(id, run, "claim_analysis")]);
    expect(claims.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await expect(transition(id, run, "report_ready")).rejects.toThrow(/order/);
    await transition(id, run, "analysis_ready");
    await transition(id, run, "claim_report");
    const ready = await transition(id, run, "report_ready");
    expect(ready).toMatchObject({ phase: "ready", status: "completed" });
    const reports = await db.query("select * from public.report_versions where session_id=$1", [id]);
    expect(reports.rows).toHaveLength(1);
    await expect(transition(id, run, "report_ready")).rejects.toThrow(/unavailable/);
  });
  it.each([-1, 0, 1])("checks the original deadline at completion offset %s ms", async (offset) => {
    const { id, run } = await setup();
    await transition(id, run, "claim_analysis"); await transition(id, run, "analysis_ready"); await transition(id, run, "claim_report");
    await advanceTo(id, run, offset);
    if (offset < 0) expect((await transition(id, run, "report_ready")).phase).toBe("ready");
    else {
      await expect(transition(id, run, "report_ready")).rejects.toThrow(/deadline/);
      expect((await db.query("select * from public.report_versions where session_id=$1", [id])).rows).toHaveLength(0);
    }
  });
  it("preserves approval on failure and retries with the identical version and a new run", async () => {
    const { id, run } = await setup();
    await transition(id, run, "claim_analysis");
    await expect(transition(id, run, "retry")).rejects.toThrow(/in progress/);
    await transition(id, run, "fail");
    const failed = (await db.query("select phase,failed_stage from public.analysis_runs where run_id=$1", [run.run_id])).rows[0];
    expect(failed).toEqual({ phase: "failed", failed_stage: "specialist analysis" });
    const next = await transition(id, run, "retry");
    expect(next.run_id).not.toBe(run.run_id); expect(next.approved_profile_version).toBe(1);
    expect((await db.query("select profile from public.profile_versions where session_id=$1", [id])).rows).toEqual([{ profile }]);
    await expect(transition(id, run, "analysis_ready")).rejects.toThrow(/Stale/);
    await expect(transition(id, run, "fail")).rejects.toThrow(/Stale/);
    expect((await db.query("select report_status from public.sessions where id=$1", [id])).rows[0]).toEqual({ report_status: "not_started" });
  });
  it("allows recovery after a killed worker's deadline without extending that run", async () => {
    const { id, run } = await setup(); await transition(id, run, "claim_analysis");
    await advanceTo(id, run, 1);
    const next = await transition(id, run, "retry");
    expect(next.phase).toBe("pending"); expect(next.deadline_at).not.toEqual(run.deadline_at);
    await expect(transition(id, run, "analysis_ready")).rejects.toThrow(/Stale/);
  });
  it("never reuses a PDF object version after a failed/expired upload", async () => {
    const { id, run } = await setup();
    await transition(id, run, "claim_analysis"); await transition(id, run, "analysis_ready");
    const first = await transition(id, run, "claim_report");
    await advanceTo(id, run, 1);
    const next = await transition(id, run, "retry");
    await transition(id, next, "claim_analysis"); await transition(id, next, "analysis_ready");
    const second = await transition(id, next, "claim_report");
    expect(first.candidate_report_version).toBe(1); expect(second.candidate_report_version).toBe(2);
    await expect(transition(id, run, "report_ready")).rejects.toThrow(/Stale/);
    await transition(id, next, "report_ready");
    expect((await db.query("select report_version,object_key from public.report_versions where session_id=$1", [id])).rows[0])
      .toEqual({ report_version: 2, object_key: `${id}/2.pdf` });
    expect((await db.query(`select v.generated_at <= r.deadline_at as within_run,
      v.expires_at = v.generated_at + interval '24 hours' as fixed_pdf_expiry,
      v.expires_at > s.expires_at as independent_draft_expiry
      from public.report_versions v join public.analysis_runs r on r.run_id = v.run_id
      join public.sessions s on s.id = v.session_id where v.session_id = $1`, [id])).rows[0])
      .toEqual({ within_run: true, fixed_pdf_expiry: true, independent_draft_expiry: true });
  });
  it("rejects wrong owners, cancellation and a newer approval", async () => {
    const { id, run } = await setup();
    await expect(transition(id, run, "claim_analysis", other)).rejects.toThrow(/unavailable/);
    await db.query("select public.approve_and_start_analysis($1,$2,1,$3)", [id, owner, profile]);
    await expect(transition(id, run, "analysis_ready")).rejects.toThrow(/Stale/);
    await db.query("update public.sessions set status='cancelled' where id=$1", [id]);
    await expect(transition(id, run, "fail")).rejects.toThrow(/unavailable/);
  });
  it("rolls back approval if run insertion fails", async () => {
    const { id } = await setup();
    await db.exec(`create function public.test_failure() returns trigger language plpgsql as $$ begin raise exception 'injected'; end $$;
      create trigger test_failure before insert on public.analysis_runs for each row execute function public.test_failure();`);
    try { await expect(db.query("select public.approve_and_start_analysis($1,$2,1,$3)", [id, owner, profile])).rejects.toThrow(/injected/); }
    finally { await db.exec("drop trigger test_failure on public.analysis_runs; drop function public.test_failure()"); }
    expect((await db.query("select current_profile_version from public.sessions where id=$1", [id])).rows[0]).toEqual({ current_profile_version: 1 });
  });
  it("denies browser RPCs and permits owner-authorized service invoker calls", async () => {
    const { id, run } = await setup();
    await db.exec("set role authenticated");
    try { await expect(transition(id, run, "claim_analysis")).rejects.toThrow(/permission denied/); }
    finally { await db.exec("reset role"); }
    await db.exec("set role service_role");
    try { expect((await transition(id, run, "claim_analysis")).phase).toBe("analysis"); }
    finally { await db.exec("reset role"); }
  });
});

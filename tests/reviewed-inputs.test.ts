import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ApprovedProfile } from "@/types";
import type { ProcessingRun } from "@/lib/module5/processing-run";

const m = vi.hoisted(() => ({ db: null as PGlite | null, dispatch: vi.fn(), synthesize: vi.fn(), owner: "11111111-1111-4111-8111-111111111111" }));
vi.mock("@/lib/auth/api-auth", () => ({
  requireUser: async () => ({ id: m.owner }), userOwnsSession: async () => true,
  unauthorizedResponse: () => Response.json({}, { status: 401 }), notFoundResponse: () => Response.json({}, { status: 404 }),
}));
vi.mock("@/lib/module3/agent-dispatcher", () => ({ agentDispatcher: { dispatch: m.dispatch } }));
vi.mock("@/lib/module3/meta-agent-synthesizer", () => ({ metaAgentSynthesizer: { synthesize: m.synthesize } }));
// Only the transport is replaced: routes, profile construction and all transactional
// approval/edit/run/report functions execute against PostgreSQL (PGlite).
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {
  async rpc(name: string, args: Record<string, unknown>) {
    try {
      const keys = Object.keys(args);
      const result = await m.db!.query<{ data: unknown }>(`select to_jsonb(public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(",")})) as data`,
        keys.map((key) => args[key] !== null && typeof args[key] === "object" ? JSON.stringify(args[key]) : args[key]));
      return { data: result.rows[0].data, error: null };
    } catch (error) { return { data: null, error }; }
  },
  from(table: string) {
    let columns = "*";
    const clauses: string[] = [];
    const values: unknown[] = [];
    const q = {
      select(value: string) { columns = value; return q; },
      eq(column: string, value: unknown) { values.push(value); clauses.push(`${column} = $${values.length}`); return q; },
      in(column: string, entries: string[]) { values.push(entries); clauses.push(`${column} = any($${values.length})`); return q; },
      gt(column: string, value: unknown) { values.push(value); clauses.push(`${column} > $${values.length}`); return q; },
      not(column: string) { clauses.push(`${column} is not null`); return q; },
      abortSignal() { return q; },
      async single() {
        const result = await m.db!.query(`select ${columns} from public.${table} where ${clauses.join(" and ")}`, values);
        return { data: result.rows[0] ? JSON.parse(JSON.stringify(result.rows[0])) : null, error: null };
      },
      async maybeSingle() { return q.single(); },
    };
    return q;
  },
} }));
import { POST as approve } from "@/app/api/sessions/[sessionId]/approve/route";
import { POST as analyze } from "@/app/api/sessions/[sessionId]/analyze/route";
import { PATCH as edit } from "@/app/api/sessions/[sessionId]/intake/route";
import { readIntakeDraft } from "@/lib/module2/intake-draft-store";
import { loadProcessingRun, approvedRunProfile, transitionRun } from "@/lib/module5/processing-run";
import { normalizeAcademicData } from "@/lib/module2/extraction-contract";
const db = () => m.db!;
const context = (id: string) => ({ params: Promise.resolve({ sessionId: id }) });
const request = (body: unknown, method = "POST") => new NextRequest("http://localhost/api", { method, body: JSON.stringify(body) });
const notes = { careerGoal: "Undecided", interests: "Mathematics", financial: "", concerns: "", impression: "" };
const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
beforeAll(async () => {
  m.db = new PGlite();
  await db().exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text);`);
  for (const name of ["20260523000000_module2_sessions", "20260524000002_module5_session_progress",
    "20261104144015_sw03_academic_upload_validation", "20261105030355_sw02_versioned_contracts",
    "20261105081447_sw15_processing_budget", "20261106110326_sw06_extraction_drafts_cleanup",
    "20261106124126_sw07_reviewed_profile_approval"]) await db().exec(migration(name));
  await db().exec("grant select, insert, update, delete on all tables in schema public to service_role");
}, 30000);
afterAll(async () => { await db().close(); });
beforeEach(() => {
  vi.clearAllMocks();
  m.dispatch.mockResolvedValue([{ status: "SUCCESS", agentName: "AcademicAuditor" }]);
  m.synthesize.mockImplementation(async (sessionId: string) => ({ sessionId, recommendations: [] }));
});
async function seed(types = ["ncae", "nat", "form_137"]) {
  const id = (await db().query<{ id: string }>("insert into sessions(counselor_id) values ($1) returning id", [m.owner])).rows[0].id;
  await db().query(`insert into session_notes(session_id,counselor_id,career_goal,interests,financial,concerns,impression)
    values ($1,$2,$3,$4,'','','')`, [id, m.owner, notes.careerGoal, notes.interests]);
  for (const type of types) {
    const data = normalizeAcademicData(type, type === "form_137" ? { subjects: [{ name: "Mathematics", year: "2025", grade: 78 }], gwa: 79 }
      : type === "ncae" ? { strand_scores: { STEM: 78 }, overall_percentile: 79 } : { subjects: { Science: 78 }, composite_score: 79 });
    const claim = (await db().query<{ id: string; upload_token: string }>("select * from claim_academic_upload($1,$2,$3,null)", [id, m.owner, type])).rows[0];
    await db().query("select finish_academic_upload($1,$2,$3,$4,$5,'provided',$6)", [id, m.owner, claim.id, claim.upload_token, data, { documentId: claim.id, page: 1 }]);
  }
  return id;
}
async function approvalBody(id: string) {
  const draft = await readIntakeDraft(id, m.owner);
  return { notesReviewed: true, counselorNotes: Object.fromEntries(Object.keys(notes).map((key) => [key, draft.notes![key as keyof typeof notes]])),
    profileVersion: draft.profileVersion, notesRevision: draft.notes!.revision,
    documents: draft.documents.map((doc) => ({ id: doc.id, revision: doc.draft_revision })) };
}
async function confirm(id: string) {
  const response = await approve(request(await approvalBody(id)), context(id));
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()).approvedProfile as ApprovedProfile;
}
async function analyzeRun(id: string, run?: ProcessingRun) {
  run ??= (await loadProcessingRun(id, m.owner)).run;
  return analyze(request({ runId: run.run_id, profileVersion: run.approved_profile_version }), context(id));
}
async function editField(id: string, category: string) {
  const draft = await readIntakeDraft(id, m.owner);
  let body;
  if (category === "notes") body = { revision: draft.notes!.revision, notes: { ...notes, concerns: "Reviewed optional concern" } };
  else {
    const doc = draft.documents.find((doc) => doc.document_type === category)!;
    const data = structuredClone(doc.structured_data);
    if (data.type === "form_137") data.data.subjects[0].grade = 87;
    if (data.type === "ncae") data.data.strand_scores.STEM = 87;
    if (data.type === "nat") data.data.subjects.Science = null;
    body = { documentId: doc.id, revision: doc.draft_revision, data };
  }
  expect((await edit(request(body, "PATCH"), context(id))).status).toBe(200);
}

it("F07 approves edits/clears in all academic categories and notes with exact source/version/time through analysis", async () => {
  const id = await seed();
  expect((await analyze(request({ runId: "missing", profileVersion: 0 }), context(id))).status).toBe(409);
  for (const category of ["ncae", "nat", "form_137", "notes"]) await editField(id, category);
  const profile = await confirm(id);
  expect(profile.academicData.ncae?.strand_scores.STEM).toBe(87);
  expect(profile.academicData.nat?.subjects.Science).toBeNull();
  expect(profile.academicData.form137?.subjects[0].grade).toBe(87);
  expect(profile.counselorNotes.concerns).toBe("Reviewed optional concern");
  expect(profile.profileVersion).toBe(1);
  expect(Number.isFinite(Date.parse(profile.confirmedAt!))).toBe(true);
  expect(profile.inputEvidence?.documents).toHaveLength(3);
  for (const doc of profile.inputEvidence!.documents) expect(doc.source).toMatchObject({ documentId: doc.documentId, page: 1 });
  expect((await analyzeRun(id)).status).toBe(200);
  expect(m.dispatch.mock.calls[0][0].approvedProfile).toEqual(profile);
  const { run } = await loadProcessingRun(id, m.owner);
  expect(run.approved_profile_version).toBe(profile.profileVersion);
  expect(await approvedRunProfile(run)).toEqual(profile);
  const row = (await db().query<{ profile: ApprovedProfile; approved_at: Date }>("select profile,approved_at from profile_versions where session_id=$1", [id])).rows[0];
  expect(row.profile).toEqual(profile);
  expect(Date.parse(profile.confirmedAt!)).toBe(row.approved_at.getTime());
  const logs = (await db().query<{ field_name: string }>("select field_name from correction_logs where session_id=$1", [id])).rows;
  expect(logs).toHaveLength(3);
  expect(logs.every((entry) => /^(nat|ncae|form_137)\./.test(entry.field_name))).toBe(true);
});

it.each(["ncae", "nat", "form_137", "notes"])("I04 %s edit invalidates approved analysis/explanation/PDF/review and rejects late writes", async (category) => {
  const id = await seed(); const oldProfile = await confirm(id);
  await analyzeRun(id);
  let { run: oldRun } = await loadProcessingRun(id, m.owner);
  oldRun = await transitionRun(oldRun, "claim_report");
  await transitionRun(oldRun, "report_ready");
  await db().query("select review_report_version($1,$2,$3,$4,'approved')", [id, m.owner, oldProfile.profileVersion, oldRun.candidate_report_version]);
  const beforeEdit = await approvalBody(id);
  await editField(id, category);
  expect((await approve(request(beforeEdit), context(id))).status).toBe(409);
  await expect(loadProcessingRun(id, m.owner)).rejects.toMatchObject({ code: "stale" });
  await expect(db().query("select start_analysis_run($1,$2,2,null)", [id, m.owner])).rejects.toThrow(/approval required/);
  expect((await db().query("select status,approved_at from report_versions where session_id=$1", [id])).rows).toEqual([{ status: "out_of_date", approved_at: null }]);
  expect((await db().query("select approved_profile,current_run_id,report_status from sessions where id=$1", [id])).rows[0])
    .toEqual({ approved_profile: null, current_run_id: null, report_status: "not_started" });
  const current = await confirm(id); const { run } = await loadProcessingRun(id, m.owner);
  expect(current.profileVersion).toBeGreaterThan(oldProfile.profileVersion!);
  for (const action of ["analysis_ready", "report_ready", "fail"]) await expect(transitionRun(oldRun, action)).rejects.toMatchObject({ code: "stale" });
  expect((await analyzeRun(id, oldRun)).status).toBe(409);
  await analyzeRun(id, run);
  expect(m.dispatch.mock.calls.at(-1)![0].approvedProfile).toEqual(current);
  expect(await approvedRunProfile(oldRun)).toEqual(oldProfile); // immutable history
  expect((await loadProcessingRun(id, m.owner)).run.run_id).toBe(run.run_id);
});

it("I04 a delayed v1 analysis response cannot overwrite v2 after reconfirmation", async () => {
  const id = await seed(); await confirm(id);
  const { run: old } = await loadProcessingRun(id, m.owner);
  let release!: () => void;
  m.dispatch.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve([{ status: "SUCCESS" }]); }));
  const pending = analyzeRun(id, old);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  await editField(id, "notes"); const current = await confirm(id);
  expect((await analyzeRun(id)).status).toBe(200);
  release(); expect((await pending).status).toBe(409);
  const { run } = await loadProcessingRun(id, m.owner);
  expect(run.approved_profile_version).toBe(current.profileVersion);
  expect(run.phase).toBe("report_pending");
});

it("removal, replacement and expired unfinished uploads cannot resurrect excluded input", async () => {
  const id = await seed(["nat"]); await confirm(id);
  const draft = await readIntakeDraft(id, m.owner); const doc = draft.documents[0];
  const claim = (await db().query<{ upload_token: string }>("select * from claim_academic_upload($1,$2,'nat',$3)", [id, m.owner, doc.id])).rows[0];
  expect((await approve(request(await approvalBody(id)), context(id))).status).toBe(409);
  await db().query("select remove_academic_upload($1,$2,$3,$4)", [id, m.owner, doc.id, claim.upload_token]);
  const profile = await confirm(id);
  expect(profile.academicData).toEqual({}); expect(profile.inputEvidence?.documents).toEqual([]);
  const fresh = (await db().query<{ id: string; upload_token: string }>("select * from claim_academic_upload($1,$2,'nat',null)", [id, m.owner])).rows[0];
  await db().query("update extraction_results set upload_expires_at=clock_timestamp()-interval '1 second' where id=$1", [fresh.id]);
  expect((await readIntakeDraft(id, m.owner)).uploadPending).toBe(true);
  expect((await approve(request(await approvalBody(id)), context(id))).status).toBe(409);
});

it("releasing an expired replacement lease preserves a freshly reconfirmed unchanged snapshot", async () => {
  const id = await seed(["nat"]); await confirm(id);
  const doc = (await readIntakeDraft(id, m.owner)).documents[0];
  const claim = (await db().query<{ upload_token: string }>("select * from claim_academic_upload($1,$2,'nat',$3)", [id, m.owner, doc.id])).rows[0];
  await db().query("update extraction_results set upload_expires_at=clock_timestamp()-interval '1 second' where id=$1", [doc.id]);
  const profile = await confirm(id);
  const { run } = await loadProcessingRun(id, m.owner);
  await db().query("select release_academic_upload($1,$2)", [doc.id, claim.upload_token]);
  expect((await loadProcessingRun(id, m.owner)).run.run_id).toBe(run.run_id);
  expect(await approvedRunProfile(run)).toEqual(profile);
});

it("keeps photographed-note source references and unavailable evidence without invented academic values", async () => {
  const id = await seed(["nat"]);
  const doc = (await readIntakeDraft(id, m.owner)).documents[0];
  await db().query("update extraction_results set evidence_state='unreadable' where id=$1", [doc.id]);
  const source = { documentId: "synthetic-photo-reference", page: 1 };
  await db().query("select save_intake_notes($1,$2,0,$3,$4,true)", [id, m.owner, notes, source]);
  const profile = await confirm(id);
  expect(profile.academicData).toEqual({});
  expect(profile.inputEvidence?.documents[0]).toMatchObject({ documentId: doc.id, status: "unreadable" });
  expect(profile.inputEvidence?.notes).toEqual({ revision: 1, source });
});

it("preserves approved recovery retry when the saved version has no current run", async () => {
  const id = await seed([]); const profile = await confirm(id);
  await db().query("update sessions set current_run_id=null where id=$1", [id]);
  const response = await analyze(request({ runId: null, profileVersion: profile.profileVersion, retryRunId: null }), context(id));
  expect(response.status, await response.clone().text()).toBe(200);
  expect(m.dispatch.mock.calls[0][0].approvedProfile).toEqual(profile);
});

it("duplicate approvals and concurrent draft changes fail atomically without extra audit/run rows", async () => {
  const id = await seed(); await editField(id, "form_137");
  const body = await approvalBody(id);
  const results = await Promise.all([approve(request(body), context(id)), approve(request(body), context(id))]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  for (const table of ["profile_versions", "analysis_runs", "correction_logs"]) {
    expect((await db().query(`select count(*)::integer as n from ${table} where session_id=$1`, [id])).rows[0]).toEqual({ n: 1 });
  }
  // Exercise the DB guard after the builder read, rather than only the JS check.
  const stale = await readIntakeDraft(id, m.owner);
  await editField(id, "notes");
  await expect(db().query("select approve_reviewed_inputs($1,$2,$3,$4,$5,$6,'[]')", [id, m.owner,
    stale.profileVersion, stale.notes!.revision, Object.fromEntries(stale.documents.map((d) => [d.id, d.draft_revision])),
    { counselorNotes: notes }])).rejects.toThrow(/Inputs changed/);
});

it("approval failure rolls back the snapshot, run, audit and session pointers", async () => {
  const id = await seed(); await editField(id, "form_137");
  await db().exec(`create function reject_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$;
    create trigger reject_audit before insert on correction_logs for each row execute function reject_audit();`);
  try { expect((await approve(request(await approvalBody(id)), context(id))).status).toBe(500); }
  finally { await db().exec("drop trigger reject_audit on correction_logs; drop function reject_audit()"); }
  expect((await db().query("select current_profile_version,current_run_id from sessions where id=$1", [id])).rows[0])
    .toEqual({ current_profile_version: 0, current_run_id: null });
  expect((await db().query("select * from profile_versions where session_id=$1", [id])).rows).toEqual([]);
  expect((await db().query("select * from analysis_runs where session_id=$1", [id])).rows).toEqual([]);
});

it("approval RPC is service-only, owner-bound and checks expiry", async () => {
  const id = await seed([]);
  const args = [id, m.owner, 0, 0, {}, { counselorNotes: notes }, []];
  await db().exec("set role authenticated");
  try { await expect(db().query("select approve_reviewed_inputs($1,$2,$3,$4,$5,$6,$7)", args)).rejects.toThrow(/permission denied/); }
  finally { await db().exec("reset role"); }
  await expect(db().query("select approve_reviewed_inputs($1,$2,$3,$4,$5,$6,$7)", [id, id, ...args.slice(2)])).rejects.toThrow(/unavailable/);
  await db().query("update sessions set status='cancelled' where id=$1", [id]);
  expect((await approve(request({ notesReviewed: true, counselorNotes: notes, profileVersion: 0, notesRevision: 0, documents: [] }), context(id))).status).toBe(404);
  const expired = (await db().query<{ id: string }>("insert into sessions(counselor_id,created_at) values ($1,clock_timestamp()-interval '25 hours') returning id", [m.owner])).rows[0].id;
  await expect(readIntakeDraft(expired, m.owner)).rejects.toMatchObject({ status: 404 });
});

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ApprovedProfile } from "@/types";
import type { AgentName, RetrievedChunk } from "@/lib/module3/types";
import type { ProcessingRun } from "@/lib/module5/processing-run";
import { ProviderError } from "@/lib/processing-budget";

const m = vi.hoisted(() => ({ db: null as PGlite | null, generate: vi.fn(), embed: vi.fn(),
  chunks: [] as RetrievedChunk[], owner: "11111111-1111-4111-8111-111111111111" }));
vi.mock("@/lib/auth/api-auth", () => ({ requireUser: async () => ({ id: m.owner }), userOwnsSession: async () => true }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class {
  models;
  constructor({ apiKey }: { apiKey: string }) {
    this.models = { embedContent: m.embed, generateContent: (request: unknown) => m.generate(apiKey, request) };
  }
} }));
// Replace external transports only. Dispatch, specialists, retrieval validation,
// synthesis, scoring, assembly, route and transactional publication execute normally.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {
  rpc(name: string, args: Record<string, unknown>) {
    const response = (async () => {
      if (name === "match_knowledge_chunks") return { data: m.chunks.filter((c) => c.silo_id === args.target_silo_id), error: null };
      try {
        const keys = Object.keys(args);
        const result = await m.db!.query<{ data: unknown }>(`select to_jsonb(public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(",")})) as data`,
          keys.map((key) => args[key] !== null && typeof args[key] === "object" ? JSON.stringify(args[key]) : args[key]));
        return { data: result.rows[0].data, error: null };
      } catch (error) { return { data: null, error }; }
    })();
    return Object.assign(response, { abortSignal: () => response });
  },
  from(table: string) {
    let columns = "*";
    const clauses: string[] = [], values: unknown[] = [];
    const q = {
      select(value: string) { columns = value; return q; },
      eq(column: string, value: unknown) { values.push(value); clauses.push(`${column} = $${values.length}`); return q; },
      not(column: string) { clauses.push(`${column} is not null`); return q; },
      abortSignal() { return q; },
      async single() {
        const result = await m.db!.query(`select ${columns} from public.${table} where ${clauses.join(" and ")}`, values);
        return { data: result.rows[0] ? JSON.parse(JSON.stringify(result.rows[0])) : null, error: null };
      },
    };
    return q;
  },
} }));
import { POST } from "@/app/api/sessions/[sessionId]/analyze/route";
import { AGENT_SILO_MAP, AGENT_SOURCE_MAP } from "@/lib/module3/types";
import { validateRankedRecommendationList } from "@/lib/report/types";
import { runRecommendationProvider } from "@/lib/module3/recommendation-provider";
import { assembleReportData } from "@/lib/report/assembler";
import { buildReportPdf } from "@/lib/report/pdf-renderer";

const agents = Object.keys(AGENT_SILO_MAP) as AgentName[];
const profile: ApprovedProfile = { sessionId: "synthetic", sessionTimestamp: "2026-11-07T00:00:00Z",
  academicData: { nat: { subjects: { Mathematics: 80 } } },
  counselorNotes: { careerGoal: "Undecided", interests: "Mathematics", financial: "Limited budget", concerns: "", impression: "" } };
const fixtures: RetrievedChunk[] = agents.flatMap((agent) => AGENT_SOURCE_MAP[agent].map((source) => ({
  silo_id: AGENT_SILO_MAP[agent], source_type: source, source_url: `https://example.gov.ph/${source}`, chunk_index: 0,
  content: "Synthetic public evidence", acquisition_method: "automated_pdf", source_metadata: { title: source },
  ingestion_timestamp: "2026-11-01T00:00:00Z", publication_date: null, official_source_url: null,
  similarity: 1, embedding_model: "gemini-embedding-001", embedding_dimensions: 768,
})));
function candidate(aptitudeRef = "academicData.nat.subjects.Mathematics") {
  return { careerPath: "Supported path", aptitudeScore: 80, demandScore: 60, feasibilityScore: 90,
    signals: ["Synthetic supported finding"], keySignalDetails: [], componentEvidence: {
      aptitude: { inputReferences: [aptitudeRef], sourceReferences: [], explanation: "Approved aptitude input" },
      demand: { inputReferences: [], sourceReferences: [{ reference: "https://example.gov.ph/dole_ble_lmi", chunkIndex: 0 }], explanation: "DOLE demand" },
      feasibility: { inputReferences: ["counselorNotes.financial"], sourceReferences: [{ reference: "https://example.gov.ph/ched_cmo", chunkIndex: 0 }], explanation: "CHED and approved budget" },
    } };
}
function generate(key: string, request: { contents: string }) {
  if (key !== "synthesis") return { text: JSON.stringify({ summary: `Valid ${key} output` }) };
  return { text: JSON.stringify(request.contents.includes("Synthesis Interpreter")
    ? { candidates: [candidate()] } : { rankings: [{ careerPath: "Supported path", reasoningSummary: "Supported comparison" }] }) };
}
const db = () => m.db!;
beforeAll(async () => {
  m.db = new PGlite();
  await db().exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; grant usage on schema private to authenticated;
    create schema auth;
    create table auth.users(id uuid, raw_app_meta_data jsonb, email_confirmed_at timestamptz, is_anonymous boolean, deleted_at timestamptz, banned_until timestamptz);
    create table auth.sessions(id uuid, user_id uuid, not_after timestamptz);
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text);`);
  for (const name of ["20260523000000_module2_sessions", "20260524000002_module5_session_progress",
    "20261104144015_sw03_academic_upload_validation", "20261105030355_sw02_versioned_contracts",
    "20261105081447_sw15_processing_budget", "20261106110326_sw06_extraction_drafts_cleanup",
    "20261106124126_sw07_reviewed_profile_approval", "20261106132602_sw08_restricted_correction_logs"]) {
    await db().exec(readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
  }
}, 30000);
afterAll(async () => { await db().close(); });
beforeEach(() => {
  vi.clearAllMocks(); m.chunks = fixtures;
  for (const [env, key] of [["ACADEMIC_AUDITOR_API_KEY", agents[0]], ["INDUSTRY_ANALYST_API_KEY", agents[1]],
    ["FEASIBILITY_STRATEGIST_API_KEY", agents[2]], ["SYNTHESIS_API_KEY", "synthesis"], ["EMBEDDING_MODEL", "gemini-embedding-001"], ["EMBEDDING_DIMENSIONS", "768"]]) vi.stubEnv(env, key);
  m.embed.mockResolvedValue({ embeddings: [{ values: Array(768).fill(0.1) }] });
  m.generate.mockImplementation(generate);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function seed(input = profile) {
  const id = (await db().query<{ id: string }>("insert into sessions(counselor_id) values ($1) returning id", [m.owner])).rows[0].id;
  const run = (await db().query<ProcessingRun>("select * from approve_and_start_analysis($1,$2,0,$3)", [id, m.owner, input])).rows[0];
  return run;
}
function analyze(run: ProcessingRun) {
  return POST(new NextRequest("https://example.test/api/analyze", { method: "POST",
    body: JSON.stringify({ runId: run.run_id, profileVersion: run.approved_profile_version }) }),
  { params: Promise.resolve({ sessionId: run.session_id }) });
}
function synthesisPrompt() {
  return m.generate.mock.calls.find(([key, request]) => key === "synthesis" && request.contents.includes("Synthesis Interpreter"))?.[1].contents as string;
}

it.each([[agents[0]], [agents[1]], [agents[2]], [agents[0], agents[1]], [agents[0], agents[2]], [agents[1], agents[2]]])(
  "preserves supported components after exhausted retries: %j", async (...failed) => {
    const run = await seed();
    const started = new Set<string>();
    const allStarted = Promise.withResolvers<void>();
    m.generate.mockImplementation((key, request) => {
      if (key !== "synthesis") {
        started.add(key); if (started.size === 3) allStarted.resolve();
        if (failed.includes(key)) throw new ProviderError(503, null, { private: "RAW_SENTINEL" });
      }
      return generate(key, request);
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = analyze(run);
    await allStarted.promise;
    await vi.advanceTimersByTimeAsync(2000);
    const response = await pending;
    expect(response.status).toBe(200);
    const body = await response.json(), list = body.rankedRecommendations;
    expect(validateRankedRecommendationList(list)).toEqual([]);
    expect(list.recommendations[0]).toMatchObject({ alignmentScore: null, rank: null, status: "incomplete", approvedProfileVersion: 1 });
    for (const [i, field] of ["aptitudeFit", "marketDemand", "financialFeasibility"].entries()) {
      expect(list.recommendations[0][field]).toBe(failed.includes(agents[i]) ? null : [80, 60, 90][i]);
    }
    for (const agent of agents) {
      expect(m.generate.mock.calls.filter(([key]) => key === agent)).toHaveLength(failed.includes(agent) ? 2 : 1);
      expect(body.agentStatuses.find((s: { agent: string }) => s.agent === agent).status).toBe(failed.includes(agent) ? "FAILED" : "SUCCESS");
      if (failed.includes(agent)) expect(list.recommendations[0].incompleteReason).toContain(agent);
      expect(synthesisPrompt()).toContain(failed.includes(agent) ? `"agent":"${agent}","status":"FAILED","analysis":""` : `Valid ${agent} output`);
    }
    expect(JSON.stringify(body)).not.toContain("RAW_SENTINEL");
    const resumed = await analyze(run);
    expect((await resumed.json()).agentStatuses).toEqual(body.agentStatuses);
    expect((await db().query<{ recommendations: unknown }>("select recommendations from analysis_runs where run_id=$1", [run.run_id])).rows[0].recommendations).toEqual(list);
    expect(await runRecommendationProvider(profile, list).getRankedRecommendations(run.session_id)).toEqual(list);
    const payload = await assembleReportData(run.session_id, { provider: runRecommendationProvider(profile, list) });
    const pdf = buildReportPdf(payload).toString("latin1");
    expect(pdf).toContain("UNSCORED PARTIAL COMPARISONS");
    for (const agent of failed) expect(pdf).toContain(agent);
  });

it("retries a transient failure once, starts all specialists together, and preserves a complete ranking", async () => {
  const run = await seed(), allStarted = Promise.withResolvers<void>();
  const firstResponses = Promise.withResolvers<void>();
  let starts = 0, academicAttempts = 0;
  m.generate.mockImplementation(async (key, request) => {
    if (key !== "synthesis") {
      if (++starts === 3) allStarted.resolve();
      await firstResponses.promise;
      if (key === agents[0] && ++academicAttempts === 1) throw new ProviderError(503, null, {});
    }
    return generate(key, request);
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const pending = analyze(run);
  await allStarted.promise;
  expect(starts).toBe(3);
  firstResponses.resolve();
  await vi.advanceTimersByTimeAsync(1999); expect(academicAttempts).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  const body = await (await pending).json();
  expect(body.rankedRecommendations.recommendations[0]).toMatchObject({ status: "complete", rank: 1, alignmentScore: 74.5 });
  expect(academicAttempts).toBe(2);
});

it.each(["{broken", "null", "[]", "{}", '{"summary":123}', '{"summary":" "}'])("rejects malformed specialist output without losing other results: %s", async (text) => {
  const run = await seed();
  m.generate.mockImplementation((key, request) => key === agents[0] ? { text } : generate(key, request));
  const body = await (await analyze(run)).json();
  expect(body.agentStatuses[0].status).toBe("FAILED");
  expect(body.rankedRecommendations.recommendations[0]).toMatchObject({ aptitudeFit: null, marketDemand: 60, financialFeasibility: 90, alignmentScore: null });
  expect(m.generate.mock.calls.filter(([key]) => key === agents[0])).toHaveLength(1);
});

it("records unavailable retrieval evidence explicitly", async () => {
  const run = await seed(); m.chunks = fixtures.filter((c) => c.silo_id !== AGENT_SILO_MAP.AcademicAuditor);
  const body = await (await analyze(run)).json();
  expect(body.agentStatuses[0]).toMatchObject({ status: "UNAVAILABLE", unavailableEvidence: [expect.stringContaining("psa_openstat_lfs")] });
  expect(body.rankedRecommendations.recommendations[0].aptitudeFit).toBeNull();
});

it.each(["all failed", "all unavailable", "unsupported synthesis", "malformed synthesis"])("returns recovery and keeps approved work for %s", async (mode) => {
  const run = await seed();
  if (mode === "all failed") m.generate.mockRejectedValue(new ProviderError(401, null, {}));
  if (mode === "all unavailable") m.chunks = [];
  if (mode.includes("synthesis")) m.generate.mockImplementation((key, request) => key === "synthesis"
    ? { text: mode === "malformed synthesis" ? "{bad" : '{"candidates":[]}' } : generate(key, request));
  const response = await analyze(run), body = await response.json();
  expect(response.status).toBe(mode === "malformed synthesis" ? 502 : 422);
  expect(body.error).toMatch(/Retry.*(End Session|Confirm Information)/);
  expect(body.retryRunId).toBe(run.run_id);
  const saved = (await db().query<{ phase: string; recommendations: unknown }>("select phase,recommendations from analysis_runs where run_id=$1", [run.run_id])).rows[0];
  expect(saved).toEqual({ phase: "failed", recommendations: null });
  expect((await db().query("select profile from profile_versions where session_id=$1 and approved_at is not null", [run.session_id])).rows).toHaveLength(1);
  if (mode.startsWith("all")) expect(m.generate.mock.calls.some(([key]) => key === "synthesis")).toBe(false);
});

it.each(Array.from({ length: 8 }, (_, i) => i))("handles academic-document combination %i without inventing missing academic evidence", async (mask) => {
  const academicData = { ...(mask & 1 ? { nat: { subjects: { Mathematics: 80 } } } : {}),
    ...(mask & 2 ? { ncae: { strand_scores: { STEM: 80 } } } : {}),
    ...(mask & 4 ? { form137: { subjects: [{ name: "Science", grade: 80, year: "2025" }] } } : {}) };
  const input = { ...profile, academicData, counselorNotes: { ...profile.counselorNotes, financial: "" } }, run = await seed(input);
  // Deliberately ask to score missing NAT; the server must withhold it.
  const body = await (await analyze(run)).json();
  expect(body.rankedRecommendations.recommendations[0].aptitudeFit).toBe(mask & 1 ? 80 : null);
  expect(body.rankedRecommendations.recommendations[0].financialFeasibility).toBeNull();
  const evidence = await runRecommendationProvider(input, body.rankedRecommendations).getAcademicEvidenceSummary(run.session_id);
  expect(evidence.availableDocuments).toHaveLength(Number(!!(mask & 1)) + Number(!!(mask & 2)) + Number(!!(mask & 4)));
  expect(evidence.missingDocuments.length + evidence.availableDocuments.length).toBe(3);
});

it("supports a notes-only partial suggestion without treating interests as measured academic performance", async () => {
  const input = { ...profile, academicData: {}, counselorNotes: { ...profile.counselorNotes, financial: "" } }, run = await seed(input);
  m.generate.mockImplementation((key, request) => key === "synthesis" && request.contents.includes("Synthesis Interpreter")
    ? { text: JSON.stringify({ candidates: [candidate("counselorNotes.interests")] }) } : generate(key, request));
  const response = await analyze(run), body = await response.json();
  expect(response.status).toBe(200);
  expect(body.rankedRecommendations.recommendations[0]).toMatchObject({ aptitudeFit: 80, financialFeasibility: null, alignmentScore: null, status: "incomplete" });
  expect(body.rankedRecommendations.recommendations[0].componentEvidence.aptitude.inputReferences).toEqual(["counselorNotes.interests"]);
});

it("rejects a late partial result from an obsolete approved profile at the real publication boundary", async () => {
  const run = await seed(), delayed = Promise.withResolvers<{ text: string }>(), started = Promise.withResolvers<void>();
  m.generate.mockImplementation((key, request) => {
    if (key === agents[0]) { started.resolve(); return delayed.promise; }
    if (key === agents[1]) throw new ProviderError(401, null, {});
    return generate(key, request);
  });
  const pending = analyze(run); await started.promise;
  await db().query("select save_profile_version($1,$2,1,$3,false)", [run.session_id, m.owner, { ...profile, counselorNotes: { ...profile.counselorNotes, interests: "Revised" } }]);
  delayed.resolve({ text: '{"summary":"Late old-profile analysis"}' });
  const response = await pending;
  expect(response.status).toBe(409);
  expect((await response.json()).error).toMatch(/stale/);
  expect((await db().query("select current_profile_version,current_run_id from sessions where id=$1", [run.session_id])).rows[0]).toEqual({ current_profile_version: 2, current_run_id: null });
  expect((await db().query("select status,recommendations from analysis_runs where run_id=$1", [run.run_id])).rows[0]).toEqual({ status: "superseded", recommendations: null });
});

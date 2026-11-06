import assert from "node:assert/strict";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Real Next.js HTTP routes, with only external services replaced by synthetic fixtures.
// No real credentials, hosted database, paid provider calls or student files are used.
const root = fileURLToPath(new URL("../", import.meta.url));
const next = `${root}node_modules/next/dist/bin/next`;
const secret = "SW29_SERVER_SECRET_SENTINEL";
const forbidden = "SW29_PRIVATE_MARKER";
const financial = "SW29_FINANCIAL_CONTEXT";
const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const profile = {
  sessionId, sessionTimestamp: "2026-11-05T00:00:00Z", studentName: forbidden,
  counselorNotes: { careerGoal: "Engineering", interests: "Mathematics", financial,
    concerns: forbidden, impression: forbidden, privateNotes: forbidden },
  academicData: {
    studentName: forbidden,
    ncae: { strand_scores: { "Scientific Ability": 90 }, overall_percentile: 90, studentName: forbidden },
    nat: { subjects: { Mathematics: 90 }, composite_score: 90, studentName: forbidden },
    form137: { subjects: [{ name: "Mathematics", grade: 90, year: "2025-2026", studentName: forbidden }], gwa: 90, studentName: forbidden },
  },
};
const env = { ...process.env, NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://sw29.supabase.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon",
  SUPABASE_SERVICE_ROLE_KEY: secret, DOCUMENT_INTAKE_API_KEY: secret,
  ACADEMIC_AUDITOR_API_KEY: secret, INDUSTRY_ANALYST_API_KEY: secret,
  FEASIBILITY_STRATEGIST_API_KEY: secret, SYNTHESIS_API_KEY: secret,
  GEMINI_GENERATION_MODEL: "gemini-3.8-flash", GEMINI_API_VERSION: "v1beta",
  EMBEDDING_MODEL: "gemini-embedding-001", EMBEDDING_DIMENSIONS: "768",
};
const syntheticImage = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer();
const runId = "33333333-3333-4333-8333-333333333333";
const extractionId = "44444444-4444-4444-8444-444444444444";
const run = (phase = "pending", recommendations = null) => ({ session_id: sessionId, counselor_id: userId,
  run_id: runId, approved_profile_version: 1, analysis_started_at: new Date().toISOString(),
  deadline_at: new Date(Date.now() + 300000).toISOString(), status: "running", phase,
  recommendations, failed_stage: null, candidate_report_version: null });
const requests = [];
const children = new Set();
const checks = [];
const fixtureErrors = [];
let mode = "success";
let logs = "";
function start(args, overrides = {}) {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...env, ...overrides }, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  child.on("exit", () => children.delete(child));
  child.stdout.on("data", chunk => { logs += chunk; });
  child.stderr.on("data", chunk => { logs += chunk; });
  return child;
}
function json(body, status = 200) {
  return { status, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
function gemini(text) {
  return json({ candidates: [{ content: { role: "model", parts: [{ thought: true, text: forbidden }, { text }] }, finishReason: "STOP" }] });
}
function dispatch(request) {
  requests.push(request);
  const url = new URL(request.url);
  const body = request.body && request.headers["content-type"]?.includes("application/json") ? JSON.parse(request.body) : {};
  if (url.hostname === "sw29.supabase.test") {
    if (url.pathname === "/auth/v1/user") return json({ id: userId, email: "synthetic@example.test",
      invited_at: "2026-11-01T00:00:00Z", email_confirmed_at: "2026-11-01T00:00:00Z",
      app_metadata: { role: "counselor", counselor_activated: true } });
    if (url.pathname.endsWith("/rpc/counselor_access")) return json("active");
    if (url.pathname.endsWith("/rpc/claim_academic_upload")) return json({ id: extractionId, upload_token: runId });
    if (url.pathname.endsWith("/rpc/finish_academic_upload")) return json({ id: extractionId,
      structured_data: body.p_data, original_data: body.p_data, evidence_state: body.p_evidence,
      provenance: body.p_provenance, draft_revision: 1 });
    if (url.pathname.endsWith("/rpc/release_academic_upload")) return json(null);
    if (url.pathname.endsWith("/rpc/claim_extraction_cleanup")) return json([]);
    if (url.pathname.endsWith("/rpc/read_intake_draft")) return json({ documents: [], notes: { revision: 0 }, uploadPending: false });
    if (url.pathname.endsWith("/rpc/save_intake_notes")) return json({ draft_revision: 1 });
    if (url.pathname === "/rest/v1/analysis_runs" && request.method === "GET") return json(run());
    if (url.pathname === "/rest/v1/profile_versions" && request.method === "GET") return json({ profile });
    if (url.pathname.endsWith("/rpc/transition_processing_run")) return json(run(body.p_action === "analysis_ready" ? "report_pending" : "analysis", body.p_result));
    if (url.pathname.endsWith("/rpc/match_knowledge_chunks")) return json([{
      content: "Synthetic public government evidence", source_url: "https://example.gov.ph/evidence",
      acquisition_method: "operator_curated_csv", ingestion_timestamp: "2026-11-01T00:00:00Z",
      silo_id: body.target_silo_id, chunk_index: 0,
      source_type: { AcademicAuditor: "psa_openstat_lfs", IndustryAnalyst: "dole_ble_lmi", FeasibilityStrategist: "ched_cmo" }[body.request_agent],
      embedding_model: "gemini-embedding-001", embedding_dimensions: 768,
    }]);
    if (url.pathname === "/rest/v1/sessions" && request.method === "GET") {
      const other = (url.searchParams.get("id") ?? "").includes("bbbbbbbb");
      return json({ counselor_id: other ? "another-owner" : userId, status: "active",
        expires_at: "2099-01-01T00:00:00Z", approved_profile: profile, module_status: {}, current_profile_version: 1, current_run_id: runId, current_report_version: 0 });
    }
    if (url.pathname.startsWith("/storage/v1/object/")) return json({ Key: "synthetic-document" });
    if (url.pathname === "/rest/v1/extraction_results") return json({ id: "synthetic-extraction", ...body });
    if (["PATCH", "POST", "DELETE"].includes(request.method)) return { status: 204, body: null };
    throw new Error(`Unhandled Supabase fixture: ${request.method} ${url.pathname}`);
  }
  assert.equal(url.protocol, "https:");
  assert.equal(url.search, "", "provider credentials must not be in URLs");
  assert.equal(request.headers["x-goog-api-key"], secret);
  if (mode === "provider-error") return json({ error: { code: 403, message: `${secret} ${forbidden}` } }, 403);
  if (url.pathname.endsWith(":batchEmbedContents")) {
    assert.match(url.pathname, /\/v1beta\/models\/gemini-embedding-001:/);
    assert.equal(body.requests.length, 1);
    assert.equal(body.requests[0].outputDimensionality, 768);
    assert.equal(body.requests[0].taskType, "RETRIEVAL_QUERY");
    return json({ embeddings: [{ values: Array(768).fill(0.01) }] });
  }
  assert.match(url.pathname, /\/v1beta\/models\/gemini-3\.8-flash:generateContent$/);
  if (mode === "malformed") return gemini(`${secret} ${forbidden} invalid JSON`);
  const prompt = body.contents.flatMap(c => c.parts ?? []).map(p => p.text ?? "").join("\n");
  if (prompt.includes('"careerGoal": "<html formatted text>"')) return gemini(JSON.stringify({
    careerGoal: "<p>Engineering</p>", interests: "<p>Math</p>", financial: "", concerns: "", impression: "", studentName: forbidden,
  }));
  if (prompt.includes("pii_regions")) return gemini(JSON.stringify({ pii_regions: [] }));
  if (prompt.includes("academic evidence")) return gemini(JSON.stringify({ evidence_state: "provided", data: {
    strand_scores: { "Scientific Ability": 90 }, overall_percentile: null, studentName: forbidden,
  } }));
  if (prompt.includes("Synthesis Interpreter")) return gemini(JSON.stringify({ candidates: ["Engineer", "Technician", "Analyst"].map(careerPath => ({
    careerPath, aptitudeScore: 0.8, demandScore: 0.7, feasibilityScore: 0.6, signals: ["Synthetic supported signal"],
    sourceReferences: [], keySignalDetails: [],
  })) }));
  if (prompt.includes("Ranking Agent")) return gemini(JSON.stringify({ rankings: ["Engineer", "Technician", "Analyst"].map(careerPath => ({
    careerPath, reasoningSummary: "Synthetic evidence summary",
  })) }));
  return gemini(JSON.stringify({ summary: "Synthetic specialist finding", strengths: ["Mathematics"],
    goal_market_alignment: "high", feasibility_assessment: "moderate", private_debug: forbidden }));
}
const fixture = createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(dispatch(JSON.parse(body))));
  } catch (error) { fixtureErrors.push(error.message); res.statusCode = 500; res.end(JSON.stringify({ error: error.message })); }
});
await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
const reserve = createServer();
await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url");
const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${payload}.synthetic-signature`;
const cookie = `sb-sw29-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: jwt, refresh_token: "synthetic", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: userId } })).toString("base64url")}`;
async function post(path, body, authenticated = true) {
  return fetch(`${origin}${path}`, { method: "POST", headers: authenticated ? { cookie } : {}, body });
}
function image(notes = false, reviewed = true) {
  const body = new FormData();
  body.set("file", new Blob([syntheticImage], { type: "image/png" }), "synthetic.png");
  if (notes && reviewed) body.set("notesReviewed", "true");
  if (notes) { body.set("sessionId", sessionId); body.set("revision", "0"); }
  if (!notes) body.set("docType", "ncae");
  return body;
}
async function check(name, operation) { await operation(); checks.push(name); console.log(`PASS ${name}`); }
try {
  if (!process.argv.includes("--skip-build")) {
    const build = start([next, "build", "--webpack"]);
    assert.equal((await once(build, "exit"))[0], 0, `Build failed:\n${logs}`);
    checks.push("production build");
  }
  for (const [name, overrides] of [
    ["blank key", { DOCUMENT_INTAKE_API_KEY: " " }],
    ["unapproved model", { GEMINI_GENERATION_MODEL: "gemini-2.5-flash" }],
    ["incompatible API version", { GEMINI_API_VERSION: "v1" }],
    ["incompatible embedding", { EMBEDDING_DIMENSIONS: "3072" }],
    ["unencrypted production service", { NEXT_PUBLIC_SUPABASE_URL: "http://sw29.supabase.test" }],
    ["public secret name", { NEXT_PUBLIC_GEMINI_API_KEY: secret }],
  ]) await check(`startup rejects ${name}`, async () => {
    const child = start([next, "start", "-p", String(port), "--hostname", "127.0.0.1"], overrides);
    const exit = await Promise.race([once(child, "exit"), new Promise((_, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(Error("Invalid startup did not terminate")); }, 20000); timer.unref();
    })]);
    assert.notEqual(exit[0], 0);
  });
  start(["--require", `${root}scripts/e2e/provider-fetch.cjs`, next, "start", "-p", String(port), "--hostname", "127.0.0.1"], { SW29_FIXTURE_ORIGIN: fixtureOrigin });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { const response = await fetch(`${origin}/login`); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Server did not start:\n${logs}`);
  const providerCalls = () => requests.filter(r => new URL(r.url).hostname === "generativelanguage.googleapis.com");
  await check("unauthorized provider routes make zero external calls", async () => {
    for (const path of ["/api/extract-notes", "/api/extract-document", `/api/sessions/${sessionId}/analyze`, `/api/sessions/${sessionId}/upload`]) {
      assert.equal((await post(path, image(), false)).status, 401);
    }
    assert.equal(providerCalls().length, 0);
  });
  await check("unreviewed notes and cross-owner analysis are denied before provider calls", async () => {
    assert.equal((await post("/api/extract-notes", image(true, false))).status, 400);
    assert.equal((await post("/api/sessions/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/analyze")).status, 404);
    assert.equal(providerCalls().length, 0);
  });
  await check("document and notes extraction use approved model/header and discard unexpected fields", async () => {
    for (const [path, notes] of [[`/api/extract-document?sessionId=${sessionId}`, false], ["/api/extract-notes", true]]) {
      const response = await post(path, image(notes));
      assert.equal(response.status, 200, await response.clone().text());
      const result = await response.text();
      assert.ok(!result.includes(forbidden));
      if (!notes) assert.equal(JSON.parse(result).structuredData.data.overall_percentile, null);
    }
  });
  await check("session upload completes image processing, extraction and selected-field persistence", async () => {
    const body = image();
    const response = await post(`/api/sessions/${sessionId}/upload`, body);
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    assert.equal(result.status, "complete");
    const write = requests.find(r => r.method === "POST" && r.url.includes("/rpc/finish_academic_upload"));
    assert.ok(write);
    assert.ok(!write.body.includes("raw_gemini_response") && !write.body.includes(forbidden));
    assert.ok(!("redactedImageUrl" in result));
    assert.ok(!providerCalls().some(r => r.body.includes("pii_regions")));
  });
  await check("analysis completes retrieval, three specialists, synthesis, ranking and persistence", async () => {
    const response = await post(`/api/sessions/${sessionId}/analyze`);
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    assert.equal(result.rankedRecommendations.recommendations.length, 3);
    assert.ok(result.agentStatuses.every(a => a.status === "SUCCESS"));
    assert.equal(providerCalls().filter(r => r.url.endsWith(":batchEmbedContents")).length, 3);
    const calls = providerCalls();
    assert.ok(calls.every(r => !r.body.includes(forbidden)), "private/unexpected fields reached provider");
    assert.equal(calls.filter(r => r.body.includes(financial)).length, 1, "financial context is feasibility-only");
    assert.ok(requests.some(r => r.method === "POST" && r.url.includes("/rpc/transition_processing_run") && r.body.includes("analysis_ready")));
  });
  await check("provider failures and malformed responses do not leak secrets or raw output", async () => {
    for (const failure of ["provider-error", "malformed"]) {
      mode = failure;
      for (const path of [`/api/extract-document?sessionId=${sessionId}`, "/api/extract-notes", `/api/sessions/${sessionId}/analyze`, `/api/sessions/${sessionId}/upload`]) {
        const response = await post(path, image(path.endsWith("notes")));
        assert.ok(response.status >= 400);
        const text = await response.text();
        assert.ok(!text.includes(secret) && !text.includes(forbidden));
      }
    }
    assert.ok(!logs.includes(secret) && !logs.includes(forbidden), "server logs contain sensitive markers");
  });
  await check("browser assets contain no server secret sentinel", async () => {
    async function scan(dir) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) await scan(path);
        else assert.ok(!(await readFile(path)).includes(Buffer.from(secret)), `Secret in ${path}`);
      }
    }
    await scan(`${root}.next/static`);
  });
  console.log(JSON.stringify({ ok: true, checks: checks.length, externalServices: "synthetic fixtures", liveProviderCalls: 0 }));
} catch (error) {
  console.error(error.message);
  console.error(fixtureErrors.join("\n"));
  console.error(logs.replaceAll(secret, "[REDACTED]").replaceAll(forbidden, "[REDACTED]"));
  process.exitCode = 1;
} finally {
  for (const child of children) child.kill("SIGTERM");
  fixture.closeAllConnections();
  await new Promise(resolve => fixture.close(resolve));
}

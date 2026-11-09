import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { request } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { loadCorpus, corpusRoot, sha256 } from "../extraction/corpus.ts";
import { compare, fields, summarize } from "../extraction/score.ts";

// Unmocked HTTP against an identified candidate, using only synthetic inputs.
// Auth files and mismatch reports belong in ignored, operator-restricted storage.
const [manifestPath, outputPath, mode = "contracts"] = process.argv.slice(2);
if (!manifestPath || !outputPath || !["contracts", "extraction", "workflow"].includes(mode)
  || process.env.SW31_LIVE !== "synthetic-release") throw Error("Read the SW-31 runbook and explicitly enable synthetic live release tests.");
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
const origin = new URL(manifest.url);
assert(origin.protocol === "https:" && origin.pathname === "/" && !origin.search && !origin.hash && !origin.username && !origin.password);
assert(manifest.syntheticOnly === true && /^[a-f0-9]{40}$/.test(manifest.commit) && manifest.deploymentId && manifest.providerVerificationRecord);
const stateFile = name => resolve(dirname(manifestPath), manifest[name]);
assert(manifest.ownerState && manifest.otherState && manifest.ownerState !== manifest.otherState);
const output = await open(outputPath, "wx", 0o600);
const result = { version: 1, execution: "unmocked_hosted_http", mode, commit: manifest.commit,
  runnerCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  runnerDirty: !!execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim(),
  runnerSha256: sha256(await readFile(new URL(import.meta.url))),
  deploymentId: manifest.deploymentId, origin: origin.origin, startedAt: new Date().toISOString(),
  manifestSha256: sha256(manifestBytes), providerVerificationRecord: manifest.providerVerificationRecord,
  localRedaction: { status: "waived", basis: "SW-05 team decision" },
  checks: [], extraction: [], createdSessionRefs: [], completed: false, releaseReady: false };
const sessionRef = id => createHash("sha256").update(id).digest("hex").slice(0, 16);
async function save() {
  const bytes = Buffer.from(JSON.stringify(result, null, 2));
  await output.write(bytes, 0, bytes.length, 0); await output.truncate(bytes.length); await output.sync();
}
// These contexts request only the manifest origin and never follow redirects.
// Bypass hosting protection equally for all actors; application auth is still tested.
const extraHTTPHeaders = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {};
const owner = await request.newContext({ storageState: stateFile("ownerState"), extraHTTPHeaders, timeout: 310_000, maxRedirects: 0 });
const other = await request.newContext({ storageState: stateFile("otherState"), extraHTTPHeaders, timeout: 30_000, maxRedirects: 0 });
const anonymous = await request.newContext({ extraHTTPHeaders, timeout: 30_000, maxRedirects: 0 });
const url = path => new URL(path, origin).href;
async function json(context, path, method = "GET", data) {
  const response = await context.fetch(url(path), { method, ...(data === undefined ? {} : { data }) });
  if (!response.ok()) throw Error(`http_${response.status()}`);
  try { return await response.json(); } catch { throw Error("invalid_json"); }
}
async function check(name, operation) {
  const row = { name, outcome: "incomplete", startedAt: new Date().toISOString() };
  result.checks.push(row); await save();
  const started = performance.now();
  try { await operation(); row.outcome = "pass"; }
  catch (error) { row.outcome = "fail"; row.code = /^http_\d{3}$/.test(error.message) ? error.message : "contract_failed"; }
  row.durationMs = performance.now() - started; await save();
  console.info(`${name}: ${row.outcome}`);
}
async function createSession() {
  const session = await json(owner, "/api/sessions", "POST");
  assert.match(session.sessionId, /^[a-f0-9-]{36}$/i);
  result.createdSessionRefs.push(sessionRef(session.sessionId)); await save(); return session.sessionId;
}
const notes = { careerGoal: "<p>Undecided</p>", interests: "<p>Mathematics and drawing</p>", financial: "", concerns: "", impression: "" };
async function prepareNotes(id) {
  const draft = await json(owner, `/api/sessions/${id}/intake`);
  await json(owner, `/api/sessions/${id}/intake`, "PATCH", { revision: draft.notes.revision, notes });
  return json(owner, `/api/sessions/${id}/intake`);
}
async function storageClient() {
  assert(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const state = JSON.parse(await readFile(stateFile("ownerState")));
  const cookies = state.cookies.map(({ name, value }) => ({ name, value }));
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll: () => cookies, setAll: () => {} } });
  const { data, error } = await client.auth.getSession();
  assert(!error && data.session);
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { accessToken: async () => data.session.access_token });
}
async function upload(id, bytes, docType, mimeType) {
  const current = await json(owner, `/api/sessions/${id}/intake`);
  const previous = current.documents.find(d => d.document_type === docType);
  const staged = await json(owner, `/api/sessions/${id}/uploads`, "POST", { docType, mimeType, size: bytes.length,
    ...(docType === "notes" ? { notesReviewed: true, revision: current.notes.revision } : {}),
    ...(previous ? { replaceDocumentId: previous.id } : {}) });
  const client = await storageClient();
  const write = await client.storage.from(staged.bucket).upload(staged.objectPath, bytes, { contentType: mimeType, upsert: false });
  assert(!write.error, "private_storage_upload_failed");
  const denied = await client.storage.from(staged.bucket).download(staged.objectPath);
  assert(denied.error, "raw_storage_read_must_be_denied");
  const path = docType === "notes" ? "/api/extract-notes" : `/api/sessions/${id}/upload`;
  const payload = { uploadId: staged.uploadId, ...(docType === "notes" ? { sessionId: id, revision: current.notes.revision, notesReviewed: true } : {}) };
  const response = await json(owner, path, "POST", payload);
  assert(!response.cleanupPending, "raw_cleanup_pending");
  const replay = await owner.post(url(path), { data: payload });
  assert(!replay.ok(), "upload_reference_replay_must_fail");
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const files = await admin.storage.from(staged.bucket).list(id);
    assert(!files.error && !files.data.some(file => `${id}/${file.name}` === staged.objectPath), "raw_object_not_deleted");
  } else result.physicalDeletionVerification = "not_run_without_restricted_operator_inventory";
  return response;
}
try {
  await save();
  if (mode === "contracts") {
    const id = await createSession();
    await check("F01/I03 unauthenticated and cross-owner session denial", async () => {
      assert.equal((await anonymous.get(url(`/api/sessions/${id}`))).status(), 401);
      assert.equal((await other.get(url(`/api/sessions/${id}`))).status(), 404);
      assert.equal((await other.post(url(`/api/sessions/${id}/uploads`), { data: {} })).status(), 404);
    });
    await check("S11 counselors cannot invoke maintenance", async () => {
      for (const path of ["/api/sessions/expired", "/api/reports/retention"]) assert.equal((await owner.post(url(path))).status(), 401);
    });
    await check("DEF-003 oversized upload rejected before storage", async () => {
      assert.equal((await owner.post(url(`/api/sessions/${id}/uploads`), { data: { docType: "nat", mimeType: "image/png", size: 10_000_001 } })).status(), 413);
    });
    await check("DEF-003 actual 10,000,000-byte private academic upload", async () => {
      const boundarySession = await createSession();
      const bytes = await readFile(new URL("nat-clean-1.png", corpusRoot));
      const padded = Buffer.concat([bytes, Buffer.alloc(10_000_000 - bytes.length)]);
      const extracted = await upload(boundarySession, padded, "nat", "image/png");
      assert.equal(extracted.evidenceState, "provided");
      assert.equal(extracted.provenance.model, "gemini-3.8-flash");
      await json(owner, `/api/sessions/${boundarySession}`, "DELETE");
    });
    await check("DEF-004 optional blanks and required values", async () => {
      const draft = await prepareNotes(id);
      const approval = { profileVersion: draft.profileVersion, notesRevision: draft.notes.revision,
        documents: [], notesReviewed: true, counselorNotes: notes };
      for (const field of ["careerGoal", "interests"]) assert.equal((await owner.post(url(`/api/sessions/${id}/approve`),
        { data: { ...approval, counselorNotes: { ...notes, [field]: "" } } })).status(), 400);
      for (const field of ["financial", "concerns", "impression"]) assert.equal(draft.notes[field], "");
      await json(owner, `/api/sessions/${id}/approve`, "POST", approval);
    });
    await check("S05 explicit termination revokes both owners", async () => {
      const ended = await json(owner, `/api/sessions/${id}`, "DELETE"); assert.equal(ended.status, "terminated");
      assert.equal((await owner.get(url(`/api/sessions/${id}`))).status(), 404);
      assert.equal((await other.get(url(`/api/sessions/${id}`))).status(), 404);
    });
    await check("I02 actual photographed-note extraction and review gate", async () => {
      const noteSession = await createSession();
      const missingReview = await owner.post(url("/api/extract-notes"), { data: { sessionId: noteSession, revision: 0 } });
      assert.equal(missingReview.status(), 400);
      const image = await readFile(new URL("notes-approved.jpg", corpusRoot));
      await upload(noteSession, image, "notes", "image/jpeg");
      const draft = await json(owner, `/api/sessions/${noteSession}/intake`);
      assert.match(draft.notes.careerGoal, /undecided/i); assert.match(draft.notes.interests, /math/i);
      assert(!/TEST-NOTES-ONLY|Synthetic Learner/.test(JSON.stringify(draft.notes)));
      await json(owner, `/api/sessions/${noteSession}`, "DELETE");
    });
  } else if (mode === "extraction") {
    const corpus = loadCorpus();
    result.corpus = { version: corpus.version, manifestSha256: corpus.manifestSha256, independentReview: corpus.independentGroundTruthReview };
    const id = await createSession();
    for (const fixture of corpus.fixtures) {
      const row = { id: fixture.id, category: fixture.category, condition: fixture.condition, sha256: fixture.sha256, outcome: "incomplete" };
      result.extraction.push(row); await save();
      const started = performance.now();
      let actual = null;
      try {
        const bytes = await readFile(new URL(fixture.file, corpusRoot)); assert.equal(sha256(bytes), fixture.sha256);
        const extracted = await upload(id, bytes, fixture.category, fixture.mimeType);
        if (extracted.evidenceState === "provided") actual = fields(extracted.structuredData);
        else row.error = "not_provided";
        row.outcome = "completed";
      } catch { row.outcome = "failed"; row.error = "extraction_or_lifecycle_failed"; }
      Object.assign(row, compare(fields(fixture.expected), actual), { durationMs: performance.now() - started });
      await save(); console.info(`${fixture.id}: ${row.outcome}; ${row.correct}/${row.total}`);
    }
    result.accuracy = summarize(result.extraction);
    await check("S05 extraction session termination", async () => { await json(owner, `/api/sessions/${id}`, "DELETE"); });
  } else {
    assert.match(manifest.sessionId ?? "", /^[a-f0-9-]{36}$/i);
    const id = manifest.sessionId;
    await check("F12/I10 exact report approval and authenticated PDF stream", async () => {
      const state = await json(owner, `/api/sessions/${id}`);
      const report = await json(owner, "/api/reports", "POST", { sessionId: id, runId: state.currentRunId });
      const path = `/api/reports/${id}?version=${report.reportVersion}&download=1`;
      assert.equal((await owner.get(url(path))).status(), 404);
      assert.equal((await other.get(url(path))).status(), 404);
      const body = { runId: report.runId, profileVersion: report.approvedProfileVersion, reportVersion: report.reportVersion, decision: "approved" };
      assert.equal((await owner.post(url(`/api/reports/${id}/review`), { data: { ...body, profileVersion: body.profileVersion + 1 } })).status(), 409);
      await json(owner, `/api/reports/${id}/review`, "POST", body);
      const pdf = await owner.get(url(path)); assert.equal(pdf.status(), 200);
      assert.equal(pdf.headers()["content-type"], "application/pdf");
      assert((await pdf.body()).subarray(0, 5).equals(Buffer.from("%PDF-")));
      assert.equal((await other.get(url(path))).status(), 404);
      result.pdfSha256 = sha256(await pdf.body());
      await json(owner, `/api/sessions/${id}`, "DELETE");
      assert.equal((await owner.get(url(path))).status(), 404);
    });
  }
  result.completed = true; result.finishedAt = new Date().toISOString(); await save();
  if (result.checks.some(row => row.outcome !== "pass") || result.extraction.some(row => row.error || row.mismatches?.length)) process.exitCode = 1;
} finally { await Promise.all([owner.dispose(), other.dispose(), anonymous.dispose()]); await output.close(); }

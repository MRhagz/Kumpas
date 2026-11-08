import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { summarize, validateWorkload, qualificationCoverage } from "./metrics.mjs";

// Run only on an identified, isolated release candidate with synthetic, saved,
// unapproved intake drafts. Cookie files stay local; no traces or payloads are saved.
const [manifestPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !outputPath) throw new Error("Usage: node scripts/release/measure.mjs MANIFEST.json NEW_RESULTS.json");
const raw = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(raw);
validateWorkload(manifest);
const file = await open(outputPath, "wx", 0o600);
const result = {
  version: 1, startedAt: new Date().toISOString(), commit: manifest.commit, deploymentId: manifest.deploymentId,
  origin: new URL(manifest.url).origin, manifestSha256: createHash("sha256").update(raw).digest("hex"),
  environment: Object.fromEntries(["hardware", "network", "providerQuota", "databaseTier", "sourceSnapshot", "providerVerificationRecord"].map(k => [k, manifest[k]])),
  coverage: qualificationCoverage(manifest.waves), samples: [], waves: [], completed: false,
  limitations: "Build identity, quotas and cold server state require operator records. Paid-tier status is accepted from the recorded user confirmation. This driver does not inject provider faults or certify S10/A01.",
};
async function save() {
  const bytes = Buffer.from(JSON.stringify(result, null, 2));
  await file.write(bytes, 0, bytes.length, 0);
  await file.truncate(bytes.length);
  await file.sync();
}
let browser;
// Preserve refreshed cookies across waves without rewriting operator auth files.
// Reloading the original refresh token can revoke a long campaign after rotation.
const refreshedStates = new Map();
try {
  await save();
  browser = await chromium.launch();
  result.browser = browser.version();
  for (const [waveIndex, wave] of manifest.waves.entries()) {
    const prepared = await Promise.all(wave.sessions.map(async (entry, index) => {
      const sample = { wave: waveIndex, kind: wave.kind, index, profile: entry.profile, account: entry.account,
        sessionRef: createHash("sha256").update(entry.sessionId).digest("hex").slice(0, 16), outcome: "setup_failed", durationMs: 0 };
      result.samples.push(sample);
      let context;
      try {
        context = await browser.newContext({ storageState: refreshedStates.get(entry.storageState) ?? resolve(dirname(manifestPath), entry.storageState) });
        const page = await context.newPage();
        page.setDefaultTimeout(30_000);
        await page.goto(new URL(`/input?session=${entry.sessionId}`, manifest.url).href);
        await page.getByRole("checkbox", { name: /I have read this notice/ }).check();
        await page.getByRole("checkbox", { name: /I have reviewed these notes/ }).check();
        const button = page.getByRole("button", { name: "Approve Inputs and Begin Analysis", exact: true });
        await button.waitFor();
        // Verify saved workload and identity without persisting its content.
        const intake = await page.request.get(new URL(`/api/sessions/${entry.sessionId}/intake`, manifest.url).href);
        if (!intake.ok()) throw new Error();
        const draft = await intake.json();
        const savedState = await page.request.get(new URL(`/api/sessions/${entry.sessionId}`, manifest.url).href);
        if (!savedState.ok()) throw new Error();
        const state = await savedState.json();
        if (state.hasApprovedProfile || state.currentRunId || state.nextStep !== "input" || !Number.isInteger(draft.profileVersion)) throw new Error();
        const count = draft.documents?.length;
        if (draft.uploadPending || !(entry.profile === "full" ? count === 3 : entry.profile === "notes" ? count === 0 : count > 0 && count < 3)) throw new Error();
        sample.outcome = "incomplete";
        return { entry, sample, page, context, button, expectedVersion: draft.profileVersion + 1 };
      } catch {
        await context?.close();
        return { sample };
      }
    }));
    // Persist the pending wave before starting paid operations, so an interrupted
    // process leaves attempted/unfinished work visible in the evidence file.
    await save();
    const waveStart = performance.now();
    await Promise.all(prepared.map(async ({ entry, sample, page, context, button, expectedVersion }) => {
      if (!page) return;
      let report;
      let httpFailure = false;
      const onResponse = async response => {
        const url = new URL(response.url());
        if (url.origin !== result.origin) return;
        if ((url.pathname.endsWith("/approve") || url.pathname.endsWith("/analyze") || url.pathname === "/api/reports") && !response.ok()) httpFailure = true;
        if (url.pathname === "/api/reports" && response.ok()) report = await response.json().catch(() => null);
      };
      page.on("response", onResponse);
      // Install the start mark at the real click, before React's handler. The
      // same browser clock continues across Next's client-side navigation.
      const start = performance.now();
      sample.startedAt = new Date().toISOString();
      try {
        await button.evaluate(element => element.addEventListener("click", () => {
          window.__sw30Start = performance.now();
        }, { capture: true, once: true }));
        await button.click();
        const outcome = await Promise.race([
          page.getByRole("link", { name: "Preview Draft PDF", exact: true }).waitFor({ timeout: Math.max(1, 300_000 - (performance.now() - start)) }).then(() => "ready"),
          page.getByRole("button", { name: /^(Retry analysis|Retry)$/ }).waitFor({ timeout: 300_000 }).then(() => "error"),
        ]);
        if (outcome === "error") throw new Error();
        sample.durationMs = await page.evaluate(() => performance.now() - window.__sw30Start);
        if (!Number.isFinite(sample.durationMs) || sample.durationMs < 0) throw new Error();
        if (!report || report.sessionId !== entry.sessionId || !report.runId || report.reviewStatus !== "draft"
          || report.approvedProfileVersion !== expectedVersion || !report.byteLength) {
          sample.outcome = "identity_mismatch";
        } else {
          sample.runId = report.runId;
          sample.reportVersion = report.reportVersion;
          sample.profileVersion = report.approvedProfileVersion;
          sample.outcome = sample.durationMs <= 300_000 ? "success" : "timeout";
        }
      } catch {
        sample.durationMs = performance.now() - start;
        sample.outcome = httpFailure ? "http_error" : sample.durationMs >= 299_000 ? "timeout" : "workflow_error";
      } finally {
        page.off("response", onResponse);
        refreshedStates.set(entry.storageState, await context.storageState());
        await context.close();
      }
    }));
    const durationMs = performance.now() - waveStart;
    result.waves.push({ index: waveIndex, kind: wave.kind, durationMs,
      ...summarize(prepared.map(p => p.sample), durationMs) });
    await save();
    console.info(`Wave ${waveIndex + 1}: ${wave.kind}; ${prepared.filter(p => p.sample.outcome === "success").length}/${prepared.length} succeeded`);
  }
  result.completed = true;
  result.finishedAt = new Date().toISOString();
  result.summaries = Object.fromEntries(["warmup", "sequential", "cold", "concurrent", "stress"].map(kind => [kind,
    summarize(result.samples.filter(s => s.kind === kind), result.waves.filter(w => w.kind === kind).reduce((n, w) => n + w.durationMs, 0))]));
  await save();
  if (result.samples.some(s => s.outcome !== "success")) process.exitCode = 1;
} finally {
  await browser?.close();
  await file.close();
}

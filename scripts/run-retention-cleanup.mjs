import { randomUUID } from "node:crypto";
const startedAt = Date.now();
const runId = randomUUID();
const base = process.env.KUMPAS_APP_URL;
const sessionSecret = process.env.SESSION_CLEANUP_SECRET;
const reportSecret = process.env.REPORT_RETENTION_SECRET;
let failed = false;
try {
  if (!base || !sessionSecret || !reportSecret) throw new Error();
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
  for (const [stage, path, secret] of [
    ["session_cleanup", "/api/sessions/expired", sessionSecret],
    ["report_cleanup", "/api/reports/retention", reportSecret],
  ]) {
    try {
      for (let batch = 0; ; batch++) {
        const response = await fetch(new URL(path, base), {
          method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(60_000),
          redirect: "error",
        });
        if (!response.ok) throw new Error();
        const result = await response.json();
        const pending = Boolean(result.warnings?.length);
        console.info("operational_event", { runId, stage, batch, durationMs: Date.now() - startedAt,
          outcome: pending ? "retry" : "success", ...(pending ? { errorCode: "cleanup_pending" } : {}) });
        if (pending) throw new Error();
        if (stage === "report_cleanup" || result.scannedCount < 50) break;
        if (batch >= 19) throw new Error();
      }
    } catch {
      failed = true;
      console.error("operational_event", { runId, stage, durationMs: Date.now() - startedAt,
        outcome: "failure", errorCode: "cleanup_retry_required" });
    }
  }
} catch {
  failed = true;
  console.error("operational_event", { runId, stage: "configuration", durationMs: Date.now() - startedAt,
    outcome: "failure", errorCode: "cleanup_configuration_invalid" });
}
if (failed) process.exitCode = 1;

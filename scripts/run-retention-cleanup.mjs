import { randomUUID } from "node:crypto";
const startedAt = Date.now();
const runId = randomUUID();
const base = process.env.KUMPAS_APP_URL;
const sessionSecret = process.env.SESSION_CLEANUP_SECRET;
const reportSecret = process.env.REPORT_RETENTION_SECRET;
const deadline = startedAt + 12 * 60_000;
const batchSize = 10;
let failed = false;
try {
  const missing = [["KUMPAS_APP_URL", base], ["SESSION_CLEANUP_SECRET", sessionSecret], ["REPORT_RETENTION_SECRET", reportSecret]]
    .filter(([, value]) => !value?.trim()).map(([name]) => name);
  if (missing.length) {
    console.error(`Configure maintenance environment: ${missing.join(", ")}. Match the deployed application secrets.`);
    throw new Error();
  }
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
  for (const [stage, path, secret] of [
    ["session_cleanup", "/api/sessions/expired", sessionSecret],
    ["report_cleanup", "/api/reports/retention", reportSecret],
  ]) {
    // Bound each capability independently so session backlog cannot starve PDFs.
    const requestDeadline = Math.min(deadline, Date.now() + 6 * 60_000);
    try {
      for (let batch = 0; ; batch++) {
        const result = await requestBatch(path, secret, stage === "session_cleanup" ? { limit: batchSize } : {}, requestDeadline);
        if (!Number.isInteger(result.scannedCount) || result.scannedCount < 0 || !Array.isArray(result.warnings)
          || (stage === "session_cleanup" ? !Number.isInteger(result.expiredCount)
            : !["ok", "completed_with_warnings"].includes(result.status))) throw new Error();
        const pending = Boolean(result.warnings?.length);
        console.info("operational_event", { runId, stage, batch, durationMs: Date.now() - startedAt,
          outcome: pending ? "retry" : "success", ...(pending ? { errorCode: "cleanup_pending" } : {}) });
        if (pending) throw new Error();
        if (stage === "report_cleanup" || result.scannedCount < batchSize) break;
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

async function requestBatch(path, secret, body, requestDeadline) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (Date.now() >= requestDeadline) throw new Error();
    let response;
    try {
      response = await fetch(new URL(path, base), {
        method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(Math.min(310_000, requestDeadline - Date.now())),
        redirect: "error",
      });
    } catch {
      if (attempt === 1) throw new Error();
    }
    if (response?.ok) return response.json();
    if (response && response.status !== 429 && response.status < 500) throw new Error();
    if (attempt === 1) throw new Error();
    const retryAfter = response?.headers.get("retry-after");
    const seconds = retryAfter === null || retryAfter === undefined ? NaN : Number(retryAfter);
    const delay = retryAfter ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()) : 2000;
    if (!Number.isFinite(delay) || delay > 60_000 || Date.now() + Math.max(2000, delay) >= requestDeadline) throw new Error();
    console.info("operational_event", { runId, stage: "maintenance_request", attempt: attempt + 1,
      outcome: "retry", errorCode: "cleanup_retry_required" });
    await new Promise(resolve => setTimeout(resolve, Math.max(2000, delay)));
  }
  throw new Error();
}

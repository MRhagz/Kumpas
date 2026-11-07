const base = process.env.KUMPAS_APP_URL;
const sessionSecret = process.env.SESSION_CLEANUP_SECRET;
const reportSecret = process.env.REPORT_RETENTION_SECRET;
if (!base || !sessionSecret || !reportSecret || new URL(base).protocol !== "https:") {
  throw new Error("HTTPS cleanup URL and lifecycle secrets are required.");
}
for (const [path, secret] of [
  ["/api/sessions/expired", sessionSecret], ["/api/reports/retention", reportSecret],
]) {
  for (let batch = 0; ; batch++) {
    const response = await fetch(new URL(path, base), {
      method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error("Retention endpoint failed.");
    const result = await response.json();
    console.info("Retention batch", { path, scannedCount: result.scannedCount, warningCount: result.warningCount ?? result.warnings?.length });
    if (result.warnings?.length) throw new Error("Retention cleanup has pending failures; investigate the failed workflow.");
    if (path.includes("reports") || result.scannedCount < 50) break;
    if (batch >= 19) throw new Error("Retention backlog requires another cleanup run.");
  }
}

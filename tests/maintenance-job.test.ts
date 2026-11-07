import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
const script = new URL("../scripts/run-retention-cleanup.mjs", import.meta.url).href;
const cwd = fileURLToPath(new URL("..", import.meta.url));
it.each(["network", "pending"])("S06 cleanup job exposes %s failures and continues both maintenance capabilities", (mode) => {
  const marker = "PRIVATE_signed-url_token_notes_provider-body";
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    globalThis.fetch = async () => {
      ${mode === "network" ? `throw new Error(${JSON.stringify(marker)});` : `return {ok:true,json:async()=>({scannedCount:1,warnings:[${JSON.stringify(marker)}]})};`}
    };
    await import(${JSON.stringify(script)});
  `], { cwd, encoding: "utf8", env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot,
    KUMPAS_APP_URL: "https://fixture.test", SESSION_CLEANUP_SECRET: "fixture-session", REPORT_RETENTION_SECRET: "fixture-report" } });
  const logs = result.stdout + result.stderr;
  expect(result.status).toBe(1);
  expect(logs).not.toContain(marker);
  expect(logs).not.toContain("fixture-session");
  expect(logs).toContain("session_cleanup");
  expect(logs).toContain("report_cleanup");
  expect(logs).toContain("cleanup_retry_required");
  if (mode === "pending") expect(logs).toContain("cleanup_pending");
});

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
const script = new URL("../scripts/run-retention-cleanup.mjs", import.meta.url).href;
const cwd = fileURLToPath(new URL("..", import.meta.url));
it.each(["network", "pending"])("S06 cleanup job exposes %s failures and continues both maintenance capabilities", (mode) => {
  const marker = "PRIVATE_signed-url_token_notes_provider-body";
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    const timeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn) => timeout(fn, 0);
    globalThis.fetch = async () => {
      ${mode === "network" ? `throw new Error(${JSON.stringify(marker)});` : `return {ok:true,json:async()=>({scannedCount:1,expiredCount:1,status:"completed_with_warnings",warnings:[${JSON.stringify(marker)}]})};`}
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

it.each(["transient", "unauthorized", "login-page", "batch"])("maintenance runner verifies actual execution: %s", mode => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    const timeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn) => timeout(fn, 0);
    let sessions = 0, reports = 0;
    globalThis.fetch = async (url, options) => {
      const session = url.pathname.includes("sessions");
      const count = session ? ++sessions : ++reports;
      if (!options.headers.Authorization.startsWith("Bearer fixture-")) throw new Error("Missing capability");
      if (options.signal.aborted) throw new Error("Unexpected aborted request");
      if (${JSON.stringify(mode)} === "unauthorized") return new Response("unauthorized", {status:401});
      if (${JSON.stringify(mode)} === "login-page") return new Response("<html>Login</html>");
      if (${JSON.stringify(mode)} === "transient" && count === 1) return new Response("PRIVATE", {status:503, headers:{"retry-after":"2"}});
      if (session && JSON.parse(options.body).limit !== 10) throw new Error("Wrong batch size");
      return Response.json({scannedCount: ${JSON.stringify(mode)} === "batch" && session && count === 1 ? 10 : 0,
        expiredCount:0,status:"ok",warnings:[]});
    };
    await import(${JSON.stringify(script)});
    console.info("requests", JSON.stringify({sessions,reports}));
  `], { cwd, encoding: "utf8", env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot,
    KUMPAS_APP_URL: "https://fixture.test", SESSION_CLEANUP_SECRET: "fixture-session", REPORT_RETENTION_SECRET: "fixture-report" } });
  expect(result.status).toBe(["unauthorized", "login-page"].includes(mode) ? 1 : 0);
  const logs = result.stdout + result.stderr;
  expect(logs).not.toContain("PRIVATE");
  expect(logs).not.toContain("fixture-session");
  expect(logs).toContain(mode === "transient" ? '"sessions":2,"reports":2'
    : mode === "batch" ? '"sessions":2,"reports":1' : '"sessions":1,"reports":1');
});

it.each(["backlog", "timeouts"])("reserves time for PDF retention after slow session %s", mode => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    let now = 0, reportsCompleted = 0;
    const reportBudgets = [];
    const budgets = new WeakMap();
    Date.now = () => now;
    globalThis.setTimeout = (fn, delay) => { now += delay; fn(); };
    AbortSignal.timeout = milliseconds => {
      const signal = new AbortController().signal;
      budgets.set(signal, milliseconds);
      return signal;
    };
    globalThis.fetch = async (url, options) => {
      const session = url.pathname.includes("sessions");
      const budget = budgets.get(options.signal);
      if (!session) reportBudgets.push(budget);
      const duration = session && ${JSON.stringify(mode)} === "timeouts" ? 400_000 : 240_000;
      now += Math.min(duration, budget);
      if (duration > budget) throw new Error("Request timed out");
      if (!session) reportsCompleted++;
      return Response.json({scannedCount:session ? 10 : 0,expiredCount:10,status:"ok",warnings:[]});
    };
    await import(${JSON.stringify(script)});
    console.info("result", JSON.stringify({reportsCompleted,reportBudgets,elapsedMs:now}));
  `], { cwd, encoding: "utf8", timeout: 5000, env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot,
    KUMPAS_APP_URL: "https://fixture.test", SESSION_CLEANUP_SECRET: "fixture-session", REPORT_RETENTION_SECRET: "fixture-report" } });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('"reportsCompleted":1,"reportBudgets":[310000],"elapsedMs":600000');
  expect(result.stdout + result.stderr).toContain("cleanup_retry_required");
});

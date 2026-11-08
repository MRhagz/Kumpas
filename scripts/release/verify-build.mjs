import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Check generated framework metadata, rather than assuming source exports reached the build.
const manifest = JSON.parse(await readFile(".next/server/functions-config-manifest.json", "utf8"));
for (const route of ["/api/sessions/[sessionId]/analyze", "/api/reports", "/api/reports/retention",
  "/api/sessions/expired", "/api/extract-document", "/api/extract-notes", "/api/sessions/[sessionId]/upload"]) {
  assert.equal(manifest.functions[route]?.maxDuration, 300, `${route} must retain its 300-second function allowance`);
}
const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
assert.equal(vercel.fluid, true);
assert.equal(vercel.crons, undefined, "Use the existing authenticated Actions scheduler only");
console.info("Release build: seven 300-second route allowances and explicit Fluid compute verified. Hosted settings still require deployment inspection.");

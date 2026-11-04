import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Start a local production build with dummy Supabase credentials first.
const baseUrl = process.env.KUMPAS_BASE_URL ?? "http://127.0.0.1:3117";
const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const apiRoot = fileURLToPath(new URL("../src/app/api", import.meta.url));
const checks = [];
async function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.name === "route.ts") {
      const route = "/api/" + relative(apiRoot, directory).split(sep).join("/")
        .replaceAll("[sessionId]", sessionId).replaceAll("[documentId]", sessionId);
      for (const match of readFileSync(path, "utf8").matchAll(/export async function (GET|POST|DELETE|PUT|PATCH)\(/g)) {
        const method = match[1];
        const response = await fetch(new URL(route, baseUrl), {
          method, redirect: "manual",
          ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) } : {}),
        });
        assert.equal(response.status, 401, `${method} ${route}`);
        assert.deepEqual(await response.json(), { error: "Unauthorized" }, `${method} ${route}`);
        checks.push(`${method} ${route}`);
      }
    }
  }
}
await scan(apiRoot);
for (const page of ["/input", "/analysis"]) {
  const next = `${page}?session=${sessionId}`;
  const response = await fetch(new URL(next, baseUrl), { redirect: "manual" });
  assert.equal(response.status, 307, page);
  const login = new URL(response.headers.get("location"), baseUrl);
  assert.equal(login.pathname, "/login");
  assert.equal(login.searchParams.get("next"), next);
  assert.match(response.headers.get("cache-control"), /no-store/);
}
assert.equal((await fetch(new URL("/login", baseUrl), { redirect: "manual" })).status, 200);
console.log(JSON.stringify({ ok: true, apiChecks: checks.length, pageRedirectChecks: 2, loginChecks: 1 }, null, 2));

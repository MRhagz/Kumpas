// Loaded only by the E2E runner's child process. Application code has no test bypass.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (["generativelanguage.googleapis.com", "sw29.supabase.test"].includes(url.hostname)) {
    const response = await originalFetch(`${process.env.SW29_FIXTURE_ORIGIN}/dispatch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: request.url, method: request.method,
        headers: Object.fromEntries(request.headers), body: await request.text() }),
    });
    const result = await response.json();
    return new Response(result.body, { status: result.status, headers: result.headers });
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("Unexpected external request blocked by provider E2E fixture");
  }
  return originalFetch(input, init);
};

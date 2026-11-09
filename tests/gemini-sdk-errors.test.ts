import { afterEach, expect, it, vi } from "vitest";
import { createGeminiClient } from "@/lib/module3/gemini-config";
import { isTransientFailure, retryDelayMs } from "@/lib/processing-budget";

afterEach(() => { vi.unstubAllGlobals(); });

it.each([400, 403, 429, 503])("preserves HTTP %i through the real SDK without a hidden retry", async (status) => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
    code: status, message: "Synthetic provider failure", details: [{ retryDelay: "3s" }],
  } }), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  const client = createGeminiClient("synthetic-key");
  const error = await client.models.generateContent({ model: "gemini-3.8-flash", contents: "Synthetic prompt" })
    .catch((error: unknown) => error);
  expect(error).toMatchObject({ status });
  expect(isTransientFailure(error)).toBe(status === 429 || status === 503);
  expect(retryDelayMs(error, Date.now())).toBe(3000);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("keeps exhausted daily quota non-retryable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
    code: 429, message: "Daily quota exhausted", details: [{ retryDelay: "3s" }],
  } }), { status: 429, headers: { "content-type": "application/json" } })));
  const error = await createGeminiClient("synthetic-key").models.generateContent({
    model: "gemini-3.8-flash", contents: "Synthetic prompt",
  }).catch((error: unknown) => error);
  expect(error).toMatchObject({ status: 429 });
  expect(isTransientFailure(error)).toBe(false);
});

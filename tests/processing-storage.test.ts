import { afterEach, expect, it, vi } from "vitest";
import { PdfFileStore } from "@/lib/report/file-store";
import { ProcessingBudget } from "@/lib/processing-budget";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("preserves Storage Retry-After and passes abort through the installed SDK", async () => {
  vi.useFakeTimers();
  const outbound = vi.fn().mockResolvedValueOnce(Response.json({ message: "busy" }, { status: 503, headers: { "Retry-After": "5" } }))
    .mockResolvedValueOnce(Response.json({ Key: "session/1.pdf" }));
  vi.stubGlobal("fetch", outbound);
  const store = new PdfFileStore({ supabaseUrl: "https://example.supabase.co", serviceRoleKey: "test" });
  const pending = new ProcessingBudget().run("PDF storage", (signal) => store.uploadReportPdf("session", Buffer.from("%PDF synthetic"), 1, signal));
  await vi.advanceTimersByTimeAsync(4999); expect(outbound).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); await expect(pending).resolves.toMatchObject({ sessionId: "session" });
  expect(outbound).toHaveBeenCalledTimes(2);
  expect(outbound.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});

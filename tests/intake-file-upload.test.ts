// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { UploadOptions } from "tus-js-client";
const m = vi.hoisted(() => ({ session: vi.fn(), start: vi.fn(), abort: vi.fn(), options: null as UploadOptions | null, failure: false }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getSession: m.session } }) }));
vi.mock("tus-js-client", () => ({ Upload: class {
  constructor(_file: File, options: UploadOptions) { m.options = options; }
  start() { m.start(); if (m.failure) m.options!.onError!(new Error("PRIVATE transfer details")); else m.options!.onSuccess!({} as never); }
  abort() { return m.abort(); }
} }));
import { uploadIntakeFile } from "@/lib/intake-file-upload";
beforeEach(() => {
  vi.clearAllMocks(); m.failure = false; m.abort.mockResolvedValue(undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "publishable");
  m.session.mockResolvedValue({ data: { session: { access_token: "PRIVATE session token" } }, error: null });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ uploadId: "temporary-id", objectPath: "session/temporary-id", bucket: "kumpas-intake-temp" })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("sends the original file directly to Storage without browser persistence or raw multipart requests to Vercel", async () => {
  const file = new File([new Uint8Array(10_000_000)], "PRIVATE student name.png", { type: "image/png" });
  expect(await uploadIntakeFile("session", file, { docType: "nat", replaceDocumentId: "current" })).toBe("temporary-id");
  const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]!.body));
  expect(body).toEqual({ docType: "nat", replaceDocumentId: "current", size: 10_000_000, mimeType: "image/png" });
  expect(m.options!.endpoint).toBe("https://fixture.storage.supabase.co/storage/v1/upload/resumable");
  expect(m.options!.chunkSize).toBe(6 * 1024 * 1024);
  expect(m.options!.storeFingerprintForResuming).toBe(false);
  expect(JSON.stringify(m.options!.metadata)).not.toMatch(/PRIVATE|student name/);
  expect(m.options!.headers).not.toHaveProperty("x-upsert");
});
it("rejects oversized files before reserving anything", async () => {
  await expect(uploadIntakeFile("session", new File([new Uint8Array(10_000_001)], "record.png"), { docType: "nat" })).rejects.toThrow("10,000,000");
  expect(fetch).not.toHaveBeenCalled(); expect(m.start).not.toHaveBeenCalled();
});
it("cancels failed transfers, queues cleanup and exposes only an actionable error", async () => {
  m.failure = true;
  await expect(uploadIntakeFile("session", new File(["file"], "record.png", { type: "image/png" }), { docType: "nat" })).rejects.toThrow("Upload interrupted or expired");
  expect(m.abort).toHaveBeenCalledOnce();
  expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({ method: "DELETE", body: JSON.stringify({ uploadId: "temporary-id" }) });
});

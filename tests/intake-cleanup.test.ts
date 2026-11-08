import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), bucket: vi.fn(), remove: vi.fn(), result: { error: null as unknown }, operations: [] as unknown[], pending: false }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {
  rpc: m.rpc, storage: { from: (bucket: string) => { m.bucket(bucket); return { remove: m.remove }; } },
  from: (table: string) => {
    const q = { update: (data: unknown) => { m.operations.push({ table, update: data }); return q; },
      delete: () => { m.operations.push({ table, delete: true }); return q; },
      eq: (key: string, value: unknown) => { m.operations.push({ key, value }); return q; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(m.result).then(resolve) };
    return q;
  },
} }));
import { drainExtractionCleanup } from "@/lib/module2/extraction-cleanup";
beforeEach(() => {
  vi.clearAllMocks(); m.operations.length = 0; m.result = { error: null }; m.pending = false;
  m.rpc.mockImplementation(async (name: string) => name === "extraction_cleanup_pending" ? { data: m.pending, error: null } : ({ data: [{ id: "object", object_path: "PRIVATE-ARTIFACT.jpg", lease_token: "lease", attempts: 1 }], error: null }));
  m.remove.mockResolvedValue({ error: null });
});
it("deletes actual Storage objects and acknowledges only its claimed lease", async () => {
  expect(await drainExtractionCleanup()).toEqual({ removed: 1, failed: 0, pending: false });
  expect(m.rpc).toHaveBeenCalledWith("claim_intake_cleanup", { p_limit: 50, p_session_id: null });
  expect(m.remove).toHaveBeenCalledWith(["PRIVATE-ARTIFACT.jpg"]);
  expect(m.operations).toContainEqual({ key: "lease_token", value: "lease" });
});
it("retains failed deletion for bounded retry without returning or logging raw errors or paths", async () => {
  m.pending = true;
  m.remove.mockResolvedValue({ error: { message: "SECRET SIGNED URL" } });
  const log = vi.spyOn(console, "error");
  try {
    expect(await drainExtractionCleanup("cancelled-session")).toEqual({ removed: 0, failed: 1, pending: true });
    expect(m.operations).toContainEqual(expect.objectContaining({ update: expect.objectContaining({ last_error: "storage_delete_failed", lease_token: null, lease_until: null }) }));
    expect(m.operations).not.toContainEqual(expect.objectContaining({ delete: true }));
    expect(log).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});
it("retries transport errors and leaves killed-worker leases recoverable if retry-state persistence fails", async () => {
  m.remove.mockRejectedValue(new Error("SECRET")); m.result = { error: { message: "PRIVATE" } };
  await expect(drainExtractionCleanup()).rejects.toThrow("Artifact cleanup state could not be saved");
  expect(m.operations).not.toContainEqual(expect.objectContaining({ delete: true }));
});
it("deletes staged raw files from their private bucket while retaining failed deletion and metadata for retry", async () => {
  m.rpc.mockImplementation(async (name: string) => name === "claim_intake_cleanup"
    ? { data: [{ id: "raw", object_path: "session/raw", bucket_id: "kumpas-intake-temp", lease_token: "lease", attempts: 1 }], error: null }
    : { data: false, error: null });
  await drainExtractionCleanup();
  expect(m.bucket).toHaveBeenCalledWith("kumpas-intake-temp");
  expect(m.bucket).not.toHaveBeenCalledWith("kumpas-documents");
});

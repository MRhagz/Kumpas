import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), deleteObject: vi.fn(), operations: [] as unknown[],
  stateError: null as unknown, terminate: vi.fn(), filters: [] as unknown[], rows: [] as unknown[] }));
vi.mock("@/lib/report/file-store", () => ({ pdfFileStore: { deleteObject: m.deleteObject } }));
vi.mock("@/lib/report/session-termination", () => ({ sessionTerminationHandler: { terminateSession: m.terminate } }));
vi.mock("@/lib/module2/extraction-cleanup", () => ({ drainExtractionCleanup: vi.fn(async () => ({ removed: 0, failed: 0, pending: false })) }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {
  rpc: m.rpc,
  from: (table: string) => {
    const q = {
      update: (value: unknown) => { m.operations.push({ table, update: value }); return q; },
      delete: () => { m.operations.push({ table, delete: true }); return q; },
      select: () => q,
      eq: (key: string, value: unknown) => { m.operations.push({ key, value }); return q; },
      is: (key: string, value: unknown) => { m.filters.push({ key, value }); return q; },
      in: (key: string, value: unknown) => { m.filters.push({ key, value }); return q; },
      or: (value: unknown) => { m.filters.push(value); return q; },
      order: () => q, limit: () => Promise.resolve({ data: m.rows, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: m.stateError }).then(resolve),
    };
    return q;
  },
} }));
import { drainReportCleanup } from "@/lib/report/artifact-cleanup";
import { runExpiredSessionCleanup } from "@/lib/module5/expired-session-cleanup";

beforeEach(() => {
  vi.clearAllMocks(); m.operations.length = 0; m.filters.length = 0; m.stateError = null; m.rows = [];
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-06T00:00:00Z"));
  m.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "claim_report_cleanup"
    ? [{ object_key: "PRIVATE/1.pdf", lease_token: "worker", attempts: 1 }] : false }));
  m.deleteObject.mockResolvedValue(undefined);
  m.terminate.mockResolvedValue({ sessionRowsPurged: true, warnings: [] });
});
afterEach(() => { vi.useRealTimers(); });

it("acknowledges object deletion only for the worker's current lease", async () => {
  expect(await drainReportCleanup()).toEqual({ removed: 1, failed: 0, pending: false });
  expect(m.deleteObject).toHaveBeenCalledWith("PRIVATE/1.pdf");
  expect(m.operations).toContainEqual({ key: "lease_token", value: "worker" });
  expect(m.operations).toContainEqual({ table: "report_artifact_cleanup", delete: true });
});
it("retains minimum bounded retry state after a deletion failure", async () => {
  m.deleteObject.mockRejectedValue(new Error("PRIVATE signed URL and provider payload"));
  m.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "claim_report_cleanup"
    ? [{ object_key: "PRIVATE/1.pdf", lease_token: "worker", attempts: 1 }] : true }));
  expect(await drainReportCleanup()).toEqual({ removed: 0, failed: 1, pending: true });
  expect(m.operations).toContainEqual({ table: "report_artifact_cleanup", update: {
    lease_token: null, lease_until: null, last_error: "storage_delete_failed", next_attempt_at: "2026-11-06T00:01:00.000Z",
  } });
  expect(JSON.stringify(m.operations)).not.toContain("signed URL");
  expect(m.operations).not.toContainEqual({ table: "report_artifact_cleanup", delete: true });
});
it("surfaces retry-state persistence failure so a killed-worker lease can later recover", async () => {
  m.stateError = { message: "PRIVATE database details" };
  await expect(drainReportCleanup()).rejects.toThrow("Report cleanup state could not be saved.");
});
it("reports pending cleanup even when failures are backing off or leased by another worker", async () => {
  m.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "claim_report_cleanup" ? [] : true }));
  expect(await drainReportCleanup()).toEqual({ removed: 0, failed: 0, pending: true });
});
it("retries cancelled and expired content, includes completed drafts, and never filters by activity", async () => {
  m.rows = [{ id: "cancelled", status: "cancelled" }, { id: "completed", status: "completed" }];
  const result = await runExpiredSessionCleanup();
  expect(result).toMatchObject({ scannedCount: 2, expiredCount: 2, warningCount: 0 });
  expect(m.terminate).toHaveBeenCalledWith("cancelled", expect.objectContaining({ terminalStatus: "cancelled" }));
  expect(m.terminate).toHaveBeenCalledWith("completed", expect.objectContaining({ terminalStatus: "expired" }));
  expect(m.filters).toContainEqual({ key: "draft_purged_at", value: null });
  expect(JSON.stringify(m.filters)).not.toContain("last_activity");
  expect(m.rpc).toHaveBeenCalledWith("queue_legacy_document_cleanup");
});
it("continues a sweep after one session fails, exposing only a safe retry warning", async () => {
  m.rows = [{ id: "one", status: "expired" }, { id: "two", status: "active" }];
  m.terminate.mockRejectedValueOnce(new Error("PRIVATE payload"));
  const logs = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = await runExpiredSessionCleanup();
  expect(JSON.stringify(logs.mock.calls)).toContain("cleanup_pending");
  expect(JSON.stringify(logs.mock.calls)).not.toContain("PRIVATE");
  logs.mockRestore();
  expect(result).toMatchObject({ scannedCount: 2, expiredCount: 1, warningCount: 1 });
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});

import { beforeEach, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ events: [] as string[], removePdf: vi.fn(), purge: vi.fn(), inventory: vi.fn() }));
vi.mock("@/lib/report/file-store", () => ({ pdfFileStore: { queueSessionReportPdfs: () => {
  boundary.events.push("inventory"); return boundary.inventory();
} } }));
vi.mock("@/lib/report/artifact-cleanup", () => ({ drainReportCleanup: () => {
  boundary.events.push("pdf cleanup"); return boundary.removePdf();
}, queueReportCleanup: vi.fn() }));
vi.mock("@/lib/module2/extraction-cleanup", () => ({ drainExtractionCleanup: vi.fn(async () => ({ removed: 0, failed: 0, pending: false })) }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {
  rpc: async (name: string, args: { p_inventory_completed?: boolean }) => {
    if (name === "queue_legacy_document_cleanup") return { error: null };
    if (name === "session_termination_state") {
      const purge = await boundary.purge();
      const clean = args.p_inventory_completed && !purge.error && !(await boundary.removePdf().catch(() => ({ pending: true }))).pending;
      return { data: { cleanupPending: !clean, reportPdfPurged: !!clean }, error: null };
    }
    boundary.events.push("purge content"); return boundary.purge();
  },
  from: () => {
    const query = {
      update: () => { boundary.events.push("revoke"); return query; },
      eq: () => query, neq: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    return query;
  },
} }));
import { SessionTerminationHandler } from "@/lib/report/session-termination";
beforeEach(() => { boundary.events.length = 0; vi.clearAllMocks(); boundary.inventory.mockResolvedValue(undefined); boundary.removePdf.mockResolvedValue({ removed: 1, failed: 0, pending: false }); boundary.purge.mockResolvedValue({ error: null }); });
it("revokes a run before artifact cleanup and removes newly persisted profile/run/report data", async () => {
  const result = await new SessionTerminationHandler().terminateSession("session");
  expect(result.sessionScrubbed).toBe(true); expect(result.reportPdfPurged).toBe(true);
  expect(boundary.events[0]).toBe("revoke");
  expect(boundary.events).not.toContain("delete correction_logs");
  expect(boundary.events).toEqual(["revoke", "inventory", "purge content", "pdf cleanup"]);
});

it("does not report complete PDF cleanup when storage inventory fails", async () => {
  boundary.inventory.mockRejectedValue(new Error("PRIVATE storage failure"));
  const result = await new SessionTerminationHandler(vi.fn()).terminateSession("session");
  expect(result.reportPdfPurged).toBe(false);
  expect(result.sessionRowsPurged).toBe(true);
  expect(result.warnings).toContain("Report artifact inventory is pending retry.");
  expect(result.warnings.join()).not.toContain("PRIVATE");
});
it("keeps access revoked and reports pending cleanup after an object deletion failure", async () => {
  boundary.removePdf.mockRejectedValue(new Error("storage unavailable"));
  const result = await new SessionTerminationHandler(vi.fn()).terminateSession("session");
  expect(boundary.events[0]).toBe("revoke"); expect(result.sessionScrubbed).toBe(true);
  expect(result.reportPdfPurged).toBe(false); expect(result.warnings).toContain("Report artifact cleanup is pending retry.");
});
it("expires draft content without deleting an independently retained PDF", async () => {
  await new SessionTerminationHandler().terminateSession("session", { terminalStatus: "expired" });
  expect(boundary.events).not.toContain("delete correction_logs");
  expect(boundary.events).toContain("purge content");
  expect(boundary.events).not.toContain("delete report_versions");
  expect(boundary.removePdf).not.toHaveBeenCalled();
});

it("retains the revoked parent for retry when the database purge fails", async () => {
  boundary.purge.mockResolvedValue({ error: { message: "private database details" } });
  const result = await new SessionTerminationHandler(vi.fn()).terminateSession("session");
  expect(result.sessionRowsPurged).toBe(false);
  expect(result.reportPdfPurged).toBe(false);
  expect(result.warnings.join()).not.toContain("private database details");
});

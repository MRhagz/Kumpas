import { beforeEach, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ events: [] as string[], removePdf: vi.fn() }));
vi.mock("@/lib/report/file-store", () => ({ pdfFileStore: { deleteReportPdf: (...args: unknown[]) => { boundary.events.push("pdf cleanup"); return boundary.removePdf(...args); } } }));
vi.mock("@/lib/module2/document-storage-service", () => ({ documentStorageService: { deleteRedacted: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: (table: string) => {
  const query = {
    select: () => query,
    update: () => { boundary.events.push("revoke"); return query; },
    delete: () => { boundary.events.push(`delete ${table}`); return query; },
    eq: () => query,
    neq: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return query;
} } }));
import { SessionTerminationHandler } from "@/lib/report/session-termination";
beforeEach(() => { boundary.events.length = 0; vi.clearAllMocks(); boundary.removePdf.mockResolvedValue(undefined); });
it("revokes a run before artifact cleanup and removes newly persisted profile/run/report data", async () => {
  const result = await new SessionTerminationHandler().terminateSession("session");
  expect(result.sessionScrubbed).toBe(true); expect(result.reportPdfPurged).toBe(true);
  expect(boundary.events[0]).toBe("revoke");
  expect(boundary.events).not.toContain("delete correction_logs");
  expect(boundary.events).toContain("delete profile_versions"); // analysis_runs cascade with the profile.
  expect(boundary.events).toContain("delete report_versions");
});
it("keeps access revoked and reports pending cleanup after an object deletion failure", async () => {
  boundary.removePdf.mockRejectedValue(new Error("storage unavailable"));
  const result = await new SessionTerminationHandler(vi.fn()).terminateSession("session");
  expect(boundary.events[0]).toBe("revoke"); expect(result.sessionScrubbed).toBe(true);
  expect(result.reportPdfPurged).toBe(false); expect(result.warnings).toContain("storage unavailable");
});
it("expires draft content without deleting an independently retained PDF", async () => {
  await new SessionTerminationHandler().terminateSession("session", { terminalStatus: "expired" });
  expect(boundary.events).not.toContain("delete correction_logs");
  expect(boundary.events).toContain("delete profile_versions");
  expect(boundary.events).not.toContain("delete report_versions");
  expect(boundary.removePdf).not.toHaveBeenCalled();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ from: vi.fn(), download: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: boundary.from } }));
vi.mock("@/lib/auth/api-auth", () => ({
  requireUser: boundary.user,
  unauthorizedResponse: () => Response.json({}, { status: 401 }),
  notFoundResponse: () => Response.json({}, { status: 404 }),
}));
vi.mock("@/lib/report/file-store", async (original) => ({
  ...await original<typeof import("@/lib/report/file-store")>(),
  pdfFileStore: { downloadReportPdf: boundary.download },
}));

import { GET } from "@/app/api/reports/[sessionId]/route";

const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const expiry = "2026-11-06T00:04:00.000Z";
type Row = Record<string, unknown>;
let session: Row;
let report: Row;
const read = (query = "version=2&download=1") => GET(
  new Request(`https://example.test/api/reports/${sessionId}?${query}`),
  { params: Promise.resolve({ sessionId }) },
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T00:01:00Z"));
  session = { id: sessionId, counselor_id: "owner", status: "expired",
    expires_at: "2026-11-06T00:00:00Z", current_run_id: "run", current_profile_version: 3,
    current_report_version: 2 };
  report = { session_id: sessionId, counselor_id: "owner", run_id: "run", report_version: 2,
    approved_profile_version: 3, status: "approved", approved_at: "2026-11-05T00:05:00Z",
    object_key: `${sessionId}/2.pdf`, expires_at: expiry };
  boundary.user.mockResolvedValue({ id: "owner" });
  boundary.download.mockResolvedValue(new Blob(["%PDF-private"]));
  boundary.from.mockImplementation((table: string) => {
    let row: Row | null = table === "sessions" ? session : report;
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { if (row?.[key] !== value) row = null; return query; },
      in: (key: string, values: unknown[]) => { if (!values.includes(row?.[key])) row = null; return query; },
      not: (key: string) => { if (row?.[key] == null) row = null; return query; },
      gt: (key: string, value: string) => { if (!(String(row?.[key]) > value)) row = null; return query; },
      maybeSingle: async () => ({ data: row, error: null }),
    };
    return query;
  });
});

afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe("I10 and S04 report delivery", () => {
  it("delivers the exact approved PDF after the draft has expired", async () => {
    const response = await read();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("%PDF-private");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(boundary.download).toHaveBeenCalledWith(sessionId, 2);
  });

  it("denies a different account and an explicitly cancelled session", async () => {
    boundary.user.mockResolvedValueOnce({ id: "other" });
    expect((await read()).status).toBe(404);
    session.status = "cancelled";
    expect((await read()).status).toBe(404);
    expect(boundary.download).not.toHaveBeenCalled();
  });

  it.each([
    { status: "draft" }, { status: "rejected" }, { status: "out_of_date" },
    { approved_at: null }, { approved_profile_version: 2 }, { run_id: "older-run" },
    { object_key: "another-session/2.pdf" }, { counselor_id: "other" },
  ])("denies invalid report metadata without reading the object (%o)", async (patch) => {
    Object.assign(report, patch);
    expect((await read()).status).toBe(404);
    expect(boundary.download).not.toHaveBeenCalled();
  });

  it("denies old links and unversioned links", async () => {
    expect((await read("version=1")).status).toBe(404);
    expect((await read("download=1")).status).toBe(404);
    expect(boundary.download).not.toHaveBeenCalled();
  });

  it("denies exactly at the PDF boundary, including reads that cross it", async () => {
    boundary.download.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date(expiry));
      return new Blob(["%PDF-private"]);
    });
    expect((await read()).status).toBe(404);
    expect((await read()).status).toBe(404);
    expect(boundary.download).toHaveBeenCalledTimes(1);
  });

  it("denies a version superseded while storage is reading", async () => {
    boundary.download.mockImplementationOnce(async () => {
      session.current_report_version = 3;
      return new Blob(["%PDF-private"]);
    });
    expect((await read()).status).toBe(404);
  });
});

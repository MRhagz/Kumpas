import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ from: vi.fn(), download: vi.fn(), user: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: boundary.from, rpc: boundary.rpc } }));
vi.mock("@/lib/auth/api-auth", () => ({
  requireUser: boundary.user,
  unauthorizedResponse: () => Response.json({}, { status: 401 }),
  notFoundResponse: () => Response.json({}, { status: 404 }),
  userOwnsSession: async (_id: string, owner: string) => session.counselor_id === owner &&
    ["active", "completed"].includes(String(session.status)) && Date.parse(String(session.expires_at)) > Date.now(),
}));
vi.mock("@/lib/report/file-store", async (original) => ({
  ...await original<typeof import("@/lib/report/file-store")>(),
  pdfFileStore: { downloadReportPdf: boundary.download },
}));

import { GET } from "@/app/api/reports/[sessionId]/route";
import { GET as preview } from "@/app/api/reports/[sessionId]/preview/route";
import { POST as review } from "@/app/api/reports/[sessionId]/review/route";
import { POST as complete } from "@/app/api/sessions/[sessionId]/complete/route";
import { reportContentMarker } from "@/lib/report/types";

const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const expiry = "2026-11-06T00:04:00.000Z";
const runId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
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
    expires_at: "2026-11-06T00:00:00Z", current_run_id: runId, current_profile_version: 3,
    current_report_version: 2 };
  report = { session_id: sessionId, counselor_id: "owner", run_id: runId, report_version: 2,
    approved_profile_version: 3, status: "approved", approved_at: "2026-11-05T00:05:00Z",
    object_key: `${sessionId}/2.pdf`, expires_at: expiry };
  boundary.user.mockResolvedValue({ id: "owner" });
  boundary.download.mockResolvedValue(new Blob(["%PDF-private"]));
  boundary.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name !== "complete_report_delivery") return { data: report, error: null };
    const valid = session.current_run_id === args.p_run_id && session.current_report_version === args.p_report_version &&
      report.status === "approved" && Date.parse(String(report.expires_at)) > Date.now();
    return { data: valid ? report : null, error: valid ? null : { message: "Stale" } };
  });
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
  it("does not complete a preview, a failed Storage read or a direct completion call", async () => {
    Object.assign(session, { status: "active", expires_at: expiry });
    report.status = "draft";
    boundary.download.mockResolvedValue(new Blob([`%PDF-1.4\n${reportContentMarker(2, 3)}Draft synthetic`]));
    const request = new Request(`https://example.test/api/reports/${sessionId}/preview?version=2&download=1`);
    const response = await preview(request, { params: Promise.resolve({ sessionId }) });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Draft synthetic");
    expect(response.headers.get("content-disposition")).toContain("-Draft.pdf");
    expect((await read()).status).toBe(404);
    expect((await complete(new Request("https://example.test", { method: "POST" }), { params: Promise.resolve({ sessionId }) })).status).toBe(410);
    expect(boundary.rpc).not.toHaveBeenCalled();
    report.status = "approved";
    boundary.download.mockRejectedValueOnce(new Error("Storage down"));
    expect((await read()).status).toBe(404);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("rejects legacy or no-longer-current previews and anonymous PDF requests", async () => {
    Object.assign(session, { status: "active", expires_at: expiry }); report.status = "draft";
    const request = () => preview(new Request(`https://example.test/preview?version=2`), { params: Promise.resolve({ sessionId }) });
    expect((await request()).status).toBe(404);
    boundary.download.mockImplementationOnce(async () => {
      session.current_report_version = 3;
      return new Blob([`%PDF-1.4\n${reportContentMarker(2, 3)}Draft`]);
    });
    expect((await request()).status).toBe(404);
    boundary.user.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect((await read()).status).toBe(401);
  });

  it("validates review requests, binds identity to auth, and supports explicit regeneration", async () => {
    Object.assign(session, { status: "active", expires_at: expiry });
    const act = (body: unknown) => review(new Request("https://example.test/review", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ sessionId }) });
    expect((await act({ decision: "approved" })).status).toBe(400);
    report.status = "draft";
    const identity = { profileVersion: 3, reportVersion: 2, runId };
    expect((await act({ ...identity, decision: "approved" })).status).toBe(409); // unmarked legacy bytes
    expect(boundary.rpc).not.toHaveBeenCalled();
    boundary.download.mockResolvedValue(new Blob([`%PDF-1.4\n${reportContentMarker(2, 3)}Draft`]));
    expect((await act({ ...identity, decision: "approved", counselorId: "attacker" })).status).toBe(200);
    expect(boundary.rpc).toHaveBeenLastCalledWith("decide_report_version", {
      p_session_id: sessionId, p_counselor_id: "owner", p_expected_version: 3,
      p_report_version: 2, p_run_id: runId, p_decision: "approved",
    });
    expect((await act({ ...identity, decision: "rejected" })).status).toBe(200);
    expect((await act({ ...identity, decision: "regenerate" })).status).toBe(200);
    expect(boundary.rpc.mock.calls.at(-1)?.[0]).toBe("regenerate_report_version");
    boundary.rpc.mockResolvedValueOnce({ data: null, error: { message: "stale" } });
    expect((await act({ ...identity, decision: "rejected" })).status).toBe(409);
    boundary.user.mockResolvedValueOnce({ id: "other" });
    expect((await act({ ...identity, decision: "regenerate" })).status).toBe(404);
  });

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

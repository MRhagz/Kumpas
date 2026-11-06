import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/auth/api-auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth/api-auth")>(),
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/report/session-termination", () => ({ sessionTerminationHandler: {} }));
vi.mock("@/lib/report/file-store", () => ({ normalizeReportSessionId: (id: string) => id }));

import { GET } from "@/app/api/sessions/[sessionId]/route";
import { listOwnerDrafts, sessionStateManager } from "@/lib/module5/session-state-manager";
import { NextRequest } from "next/server";

const createdAt = "2026-11-05T00:00:00.000Z";
const expiry = "2026-11-06T00:00:00.000Z";
const owner = "counselor-a";
const draftId = "draft-a";
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let readHook: (() => void) | undefined;

function resume() {
  return GET(new NextRequest(`https://example.test/api/sessions/${draftId}`),
    { params: Promise.resolve({ sessionId: draftId }) });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T00:01:00.000Z"));
  readHook = undefined;
  const scope = { session_id: draftId, counselor_id: owner };
  const approval = { ...scope, profile_version: 2, approved_at: createdAt, profile: "private student notes" };
  tables = {
    sessions: [{
      id: draftId, counselor_id: owner, status: "active", created_at: createdAt, expires_at: expiry,
      last_activity: createdAt, completed_at: null, current_profile_version: 2, current_run_id: "run-2",
      current_report_version: 3, report_status: "ready", profile_versions: [approval],
    }],
    profile_versions: [approval],
    analysis_runs: [{ ...scope, run_id: "run-2", approved_profile_version: 2, status: "completed",
      phase: "ready", deadline_at: "2026-11-05T00:05:00.000Z", recommendations: { private: "model output" } }],
    report_versions: [{ ...scope, run_id: "run-2", approved_profile_version: 2, report_version: 3,
      status: "draft", expires_at: "2026-11-06T00:04:00.000Z" }],
  };
  mocks.requireUser.mockResolvedValue({ id: owner });
  mocks.from.mockImplementation((table: string) => {
    let rows = [...tables[table]];
    const result = () => ({ data: rows, error: null });
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        if (!column.includes(".")) rows = rows.filter((row) => row[column] === value);
        return query;
      },
      gt: (column: string, value: string | number) => {
        rows = rows.filter((row) => (row[column] as typeof value) > value);
        return query;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return query;
      },
      not: (column: string) => {
        rows = rows.filter((row) => row[column] != null);
        return query;
      },
      order: async () => result(),
      maybeSingle: async () => {
        if (table === "report_versions") readHook?.();
        return { data: rows[0] ?? null, error: null };
      },
    };
    return query;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("S03 and S04 draft recovery", () => {
  it("resumes the same completed report stage on refresh and owner reauthentication", async () => {
    for (let request = 0; request < 2; request++) {
      const response = await resume();
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const state = await response.json();
      expect(state).toMatchObject({ nextStep: "report", expiresAt: expiry, hasReport: true });
      expect(JSON.stringify(state)).not.toMatch(/private student notes|model output/);
    }
    mocks.requireUser.mockResolvedValueOnce(null);
    expect((await resume()).status).toBe(401);
    expect(await (await resume()).json()).toMatchObject({ nextStep: "report", expiresAt: expiry });
  });

  it("hides both the list entry and direct route from a different owner", async () => {
    mocks.requireUser.mockResolvedValue({ id: "counselor-b" });
    expect(await listOwnerDrafts("counselor-b")).toEqual([]);
    expect(await listOwnerDrafts(owner)).toEqual([{ id: draftId, created_at: createdAt, expires_at: expiry }]);
    expect((await resume()).status).toBe(404);
  });

  it("expires at the creation boundary despite recent activity or a later PDF expiry", async () => {
    tables.sessions[0].last_activity = "2026-11-05T23:59:59.999Z";
    vi.setSystemTime(new Date("2026-11-05T23:59:59.999Z"));
    expect((await resume()).status).toBe(200);
    vi.setSystemTime(new Date(expiry));
    expect((await resume()).status).toBe(404);
    expect(await listOwnerDrafts(owner)).toEqual([]);
  });

  it.each([
    { approved_profile_version: 1 }, { run_id: "old-run" }, { report_version: 2 },
    { status: "out_of_date" }, { expires_at: "2026-11-05T00:01:00.000Z" },
  ])("recovers the approved profile instead of opening a stale PDF (%o)", async (stale) => {
    Object.assign(tables.report_versions[0], stale);
    expect(await (await resume()).json()).toMatchObject({
      nextStep: "analysis", analysisRestartRequired: true, hasApprovedProfile: true,
      hasReport: false, reportStatus: "not_started",
    });
  });

  it("recognizes report-ready analysis without trusting a stale report flag", async () => {
    Object.assign(tables.analysis_runs[0], { phase: "report_pending", status: "running" });
    tables.report_versions = [];
    expect(await (await resume()).json()).toMatchObject({ nextStep: "report", hasReport: false, hasRecommendations: true });
  });

  it("keeps a completed session at the final stage only with its current report", async () => {
    Object.assign(tables.sessions[0], { status: "completed", report_status: "downloaded" });
    expect(await (await resume()).json()).toMatchObject({ nextStep: "complete" });
    tables.report_versions = [];
    expect(await (await resume()).json()).toMatchObject({ hasReport: false, nextStep: "start-new-session" });
  });

  it("does not resume an older approval after the current profile changes", async () => {
    tables.sessions[0].current_profile_version = 3;
    expect(await listOwnerDrafts(owner)).toEqual([]);
    expect(await (await resume()).json()).toMatchObject({ hasApprovedProfile: false, nextStep: "input" });
  });

  it("waits for a claimed run and offers retry after the run deadline", async () => {
    Object.assign(tables.analysis_runs[0], { phase: "analysis", status: "running", recommendations: null });
    expect(await sessionStateManager.getSessionState(draftId, owner)).toMatchObject({ processingInProgress: true });
    vi.setSystemTime(new Date("2026-11-05T00:05:00.000Z"));
    expect(await sessionStateManager.getSessionState(draftId, owner)).toMatchObject({
      processingInProgress: false, analysisRetryRequired: true, nextStep: "analysis",
    });
  });

  it("rejects a report snapshot when the profile changes during the read", async () => {
    readHook = () => { tables.sessions[0].current_profile_version = 3; };
    expect((await resume()).status).toBe(404);
  });
});

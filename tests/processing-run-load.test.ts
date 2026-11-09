import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: db }));
import { loadProcessingRun } from "@/lib/module5/processing-run";

const session = (reportVersion: number) => ({
  current_run_id: "run", current_profile_version: 2, current_report_version: reportVersion,
  status: "active", expires_at: "2099-01-01T00:00:00Z",
});
const published = { run_id: "run", approved_profile_version: 2, phase: "ready", status: "completed", candidate_report_version: 1 };
const query = (data: unknown, error: unknown = null) => ({
  select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data, error }),
});

beforeEach(() => db.from.mockReset());

it("recovers the published draft when the report becomes ready between reads", async () => {
  const recheck = query(session(1));
  db.from.mockReturnValueOnce(query(session(0))).mockReturnValueOnce(query(published)).mockReturnValueOnce(recheck);
  await expect(loadProcessingRun("session", "owner")).resolves.toMatchObject({ reportVersion: 1, run: published });
  expect(recheck.eq.mock.calls).toEqual(expect.arrayContaining([
    ["id", "session"], ["counselor_id", "owner"], ["current_run_id", "run"],
    ["current_profile_version", 2], ["current_report_version", 1],
  ]));
  expect(recheck.in).toHaveBeenCalledWith("status", ["active", "completed"]);
  expect(recheck.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
});

it("rejects the mixed snapshot when the published draft is no longer current", async () => {
  db.from.mockReturnValueOnce(query(session(0))).mockReturnValueOnce(query(published))
    .mockReturnValueOnce(query(null, { code: "PGRST116" }));
  await expect(loadProcessingRun("session", "owner")).rejects.toMatchObject({ stage: "draft publication", code: "stale" });
});

it("uses the stored report version for legacy ready runs with no candidate pointer", async () => {
  db.from.mockReturnValueOnce(query(session(1))).mockReturnValueOnce(query({ ...published, candidate_report_version: null }));
  await expect(loadProcessingRun("session", "owner")).resolves.toMatchObject({ reportVersion: 1 });
  expect(db.from).toHaveBeenCalledTimes(2);
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  updateUser: vi.fn(),
  updateUserById: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: mocks, rpc: mocks.rpc }) }));
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    auth: { admin: { updateUserById: mocks.updateUserById } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  notFound: () => { throw new Error("not-found"); },
}));

import { requireUser, userOwnsSession } from "@/lib/auth/api-auth";
import { signIn, activateCounselor } from "@/lib/auth/actions";
import { safeReturnPath } from "@/lib/auth/counselor";
import { requireWorkflowAccess } from "@/lib/auth/workflow-access";

const counselor = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "counselor@example.test",
  invited_at: "2026-11-01T00:00:00Z",
  email_confirmed_at: "2026-11-01T01:00:00Z",
  app_metadata: { role: "counselor", counselor_activated: true },
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-11-01T00:00:00Z",
} as User;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: counselor }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: "active", error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.updateUserById.mockResolvedValue({ error: null });
  mocks.signInWithPassword.mockResolvedValue({ data: { user: counselor }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: {
    counselor_id: counselor.id, status: "active", expires_at: "2099-01-01T00:00:00Z",
  }, error: null });
});

describe("F13 activation", () => {
  it("sets a password and activates only an invited, live Auth session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...counselor, app_metadata: { role: "counselor" } } }, error: null });
    mocks.rpc.mockResolvedValue({ data: "invited", error: null });
    const form = new FormData(); form.set("password", "synthetic-password-123");
    await expect(activateCounselor({}, form)).rejects.toThrow("redirect:/login");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "synthetic-password-123" });
    expect(mocks.updateUserById).toHaveBeenCalledWith(counselor.id, {
      app_metadata: { role: "counselor", counselor_activated: true },
    });
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
  it("cannot replay activation after the account was activated", async () => {
    const form = new FormData(); form.set("password", "synthetic-password-123");
    expect(await activateCounselor({}, form)).toHaveProperty("error");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
  it("does not activate after a password update failure", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...counselor, app_metadata: { role: "counselor" } } }, error: null });
    mocks.rpc.mockResolvedValue({ data: "invited", error: null });
    mocks.updateUser.mockResolvedValue({ error: { message: "rejected" } });
    const form = new FormData(); form.set("password", "synthetic-password-123");
    expect(await activateCounselor({}, form)).toHaveProperty("error");
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
});

describe("F01 workflow page and return-path isolation", () => {
  it("returns an interrupted owner to the eligible session after reauthentication", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireWorkflowAccess("/analysis", "session-a"))
      .rejects.toThrow(`redirect:/login?next=${encodeURIComponent("/analysis?session=session-a")}`);
    mocks.getUser.mockResolvedValue({ data: { user: counselor }, error: null });
    expect(await requireWorkflowAccess("/analysis", "session-a")).toEqual({ id: counselor.id, email: counselor.email });
  });
  it("a different signed-in account cannot render another owner's workflow page", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...counselor, id: "counselor-b" } }, error: null });
    await expect(requireWorkflowAccess("/analysis", "session-a")).rejects.toThrow("not-found");
  });
  for (const path of ["https://attacker.example", "//attacker.example", "/input/../auth/activate", "/analysis\\evil", "/api/reports/session-a"]) {
    it(`rejects an unapproved return path: ${path}`, () => { expect(safeReturnPath(path)).toBe("/input"); });
  }
});

describe("F01/F13 counselor authorization", () => {
  it("accepts an activated roster invitation", async () => {
    expect(await requireUser()).toEqual({ id: counselor.id, email: counselor.email });
  });
  for (const [name, user, error] of [
    ["missing identity", null, null],
    ["expired token", counselor, { message: "JWT expired" }],
    ["tampered token", null, { message: "Invalid JWT" }],
    ["public signup", { ...counselor, invited_at: undefined }, null],
    ["unauthorized role", { ...counselor, app_metadata: { role: "student", counselor_activated: true } }, null],
    ["unactivated invitation", { ...counselor, app_metadata: { role: "counselor" } }, null],
    ["user-editable role", { ...counselor, app_metadata: {}, user_metadata: counselor.app_metadata }, null],
  ] as const) {
    it(`denies ${name}`, async () => {
      mocks.getUser.mockResolvedValue({ data: { user }, error });
      expect(await requireUser()).toBeNull();
    });
  }
  it("rejects non-counselors after password login and clears their auth session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...counselor, app_metadata: {} } }, error: null });
    const form = new FormData();
    form.set("email", counselor.email!);
    form.set("password", "test-password");
    expect(await signIn({}, form)).toHaveProperty("error");
    expect(mocks.signOut).toHaveBeenCalled();
  });
});

describe("I03 saved-session ownership", () => {
  it("rejects a revoked Auth session even while its JWT is unexpired", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await requireUser()).toBeNull();
  });
  it("allows the same account to resume an eligible saved session", async () => {
    expect(await userOwnsSession("session-a", counselor.id)).toBe(true);
  });
  it("denies a second counselor", async () => {
    expect(await userOwnsSession("session-a", "counselor-b")).toBe(false);
  });
  for (const state of [
    { status: "expired", expires_at: "2099-01-01T00:00:00Z" },
    { status: "cancelled", expires_at: "2099-01-01T00:00:00Z" },
    { status: "active", expires_at: "2000-01-01T00:00:00Z" },
    { status: "active", expires_at: "invalid" },
  ]) {
    it(`denies ineligible saved work: ${JSON.stringify(state)}`, async () => {
      mocks.maybeSingle.mockResolvedValue({ data: { counselor_id: counselor.id, ...state }, error: null });
      expect(await userOwnsSession("session-a", counselor.id)).toBe(false);
    });
  }
});

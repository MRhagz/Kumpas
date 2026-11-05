import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ verifyOtp: vi.fn(), signOut: vi.fn(), getUser: vi.fn(), refresh: false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: m }) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: unknown[]) => void } }) => {
    if (m.refresh) options.cookies.setAll([{ name: "refreshed-auth", value: "new-token", options: { httpOnly: true } }]);
    return { auth: m };
  },
}));
import { GET } from "@/app/auth/confirm/route";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";

const invited = { id: "a", invited_at: "2026-11-04", email_confirmed_at: "2026-11-04", app_metadata: { role: "counselor" } };
beforeEach(() => {
  vi.clearAllMocks();
  m.refresh = false;
  m.signOut.mockResolvedValue({ error: null });
  m.verifyOtp.mockResolvedValue({ data: { user: invited }, error: null });
  m.getUser.mockResolvedValue({ data: { user: null }, error: null });
});
describe("F13 invitation tokens", () => {
  it("a verified invite permits password activation, without forwarding the token", async () => {
    const response = await GET(new Request("https://kumpas.example.test/auth/confirm?token_hash=test-only-invite&type=invite"));
    expect(m.verifyOtp).toHaveBeenCalledWith({ token_hash: "test-only-invite", type: "invite" });
    expect(response.headers.get("location")).toBe("https://kumpas.example.test/auth/activate");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  for (const variant of ["expired", "previously used", "tampered"]) {
    it(`${variant} invitation fails closed`, async () => {
      m.verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: variant } });
      const response = await GET(new Request("https://kumpas.example.test/auth/confirm?token_hash=test-only-invite&type=invite"));
      expect(response.headers.get("location")).toBe("https://kumpas.example.test/auth/activate?error=invitation");
      expect(m.signOut).toHaveBeenCalledOnce();
    });
  }
  it("does not exchange non-invitation OTP types", async () => {
    await GET(new Request("https://kumpas.example.test/auth/confirm?token_hash=test-only&type=signup"));
    expect(m.verifyOtp).not.toHaveBeenCalled();
    expect(m.signOut).toHaveBeenCalledOnce();
  });
  it("an Auth user lacking administrator counselor authorization cannot activate", async () => {
    m.verifyOtp.mockResolvedValue({ data: { user: { ...invited, app_metadata: {} } }, error: null });
    const response = await GET(new Request("https://kumpas.example.test/auth/confirm?token_hash=test-only&type=invite"));
    expect(response.headers.get("location")).toContain("error=invitation");
  });
});
describe("F01 proxy cookie and navigation handling", () => {
  it("preserves the requested saved session and refreshed cookies on login redirect", async () => {
    m.refresh = true;
    const response = await proxy(new NextRequest("https://kumpas.example.test/analysis?session=session-a"));
    const url = new URL(response.headers.get("location")!);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/analysis?session=session-a");
    expect(response.cookies.get("refreshed-auth")?.value).toBe("new-token");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("never redirects an unauthorized signed-in user away from login", async () => {
    m.getUser.mockResolvedValue({ data: { user: invited }, error: null });
    const response = await proxy(new NextRequest("https://kumpas.example.test/login"));
    expect(response.headers.get("location")).toBeNull();
  });
});

import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), owns: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/api-auth", () => ({ requireUser: m.user, userOwnsSession: m.owns,
  unauthorizedResponse: () => new Response(null, { status: 401 }), notFoundResponse: () => new Response(null, { status: 404 }) }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/module2/intake-draft-store", () => ({ intakeRpc: m.rpc, draftHeaders: { "Cache-Control": "private, no-store" } }));
import { POST, DELETE } from "@/app/api/sessions/[sessionId]/uploads/route";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const context = { params: Promise.resolve({ sessionId: id }) };
const request = (body: unknown, method = "POST") => new Request("https://app.test/uploads", {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.clearAllMocks(); m.user.mockResolvedValue({ id: "owner" }); m.owns.mockResolvedValue(true);
  m.rpc.mockResolvedValue({ id, object_path: `${id}/${id}` });
});
it("prepares the inclusive 10 MB boundary and returns only upload metadata", async () => {
  const response = await POST(request({ size: 10_000_000, docType: "nat", mimeType: "image/png" }), context);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ uploadId: id, objectPath: `${id}/${id}`, bucket: "kumpas-intake-temp" });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it.each([0, 10_000_001, -1, 1.5, "100"])("rejects invalid size %j before reserving Storage", async size => {
  expect((await POST(request({ size, docType: "nat", mimeType: "image/png" }), context)).status).toBeGreaterThanOrEqual(400);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("requires reviewed notes and the saved revision before a notes photograph can be staged", async () => {
  const body = { size: 1, docType: "notes", mimeType: "image/png", revision: 0 };
  expect((await POST(request(body), context)).status).toBe(400);
  expect(m.rpc).not.toHaveBeenCalled();
  expect((await POST(request({ ...body, notesReviewed: true }), context)).status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith("prepare_temporary_upload", expect.objectContaining({ p_notes_revision: 0 }));
});
it("rejects unauthenticated and foreign requests before reading their bodies", async () => {
  for (const handler of [POST, DELETE]) {
    m.user.mockResolvedValue(null);
    const unauthed = request({});
    expect((await handler(unauthed, context)).status).toBe(401); expect(unauthed.bodyUsed).toBe(false);
    m.user.mockResolvedValue({ id: "owner" }); m.owns.mockResolvedValue(false);
    const foreign = request({});
    expect((await handler(foreign, context)).status).toBe(404); expect(foreign.bodyUsed).toBe(false);
  }
  expect(m.rpc).not.toHaveBeenCalled();
});
it("bounds upload metadata and queues cancellation without leaking internal failures", async () => {
  expect((await POST(request({ text: "x".repeat(5000) }), context)).status).toBe(400);
  expect(m.rpc).not.toHaveBeenCalled();
  expect((await DELETE(request({ uploadId: id }, "DELETE"), context)).status).toBe(200);
  m.rpc.mockRejectedValue(new Error("PRIVATE credentials and database diagnostics"));
  const failed = await POST(request({ size: 10, docType: "nat", mimeType: "image/png" }), context);
  expect(failed.status).toBe(500); expect(await failed.text()).not.toContain("PRIVATE");
});

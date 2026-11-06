import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ user: vi.fn(), owns: vi.fn(), read: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/api-auth", () => ({
  requireUser: m.user, userOwnsSession: m.owns,
  unauthorizedResponse: () => Response.json({}, { status: 401 }), notFoundResponse: () => Response.json({}, { status: 404 }),
}));
vi.mock("@/lib/module2/intake-draft-store", () => ({
  draftHeaders: { "Cache-Control": "private, no-store" }, intakeRpc: m.rpc, readIntakeDraft: m.read,
}));
import { GET, PATCH } from "@/app/api/sessions/[sessionId]/intake/route";
import { normalizeAcademicData } from "@/lib/module2/extraction-contract";
import { UploadValidationError } from "@/lib/module2/academic-upload-validation";
const context = { params: Promise.resolve({ sessionId: "session" }) };
const request = (body: unknown) => new NextRequest("http://localhost/intake", { method: "PATCH", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); m.user.mockResolvedValue({ id: "owner" }); m.owns.mockResolvedValue(true);
  m.read.mockResolvedValue({ documents: [], notes: { revision: 1 }, uploadPending: false });
  m.rpc.mockResolvedValue({ draft_revision: 2 });
});
it("reads an unapproved saved draft with private no-store headers", async () => {
  const response = await GET(new Request("http://localhost"), context);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ uploadPending: false });
});
it.each(["ncae", "nat", "form_137"])("saves a cleared %s field as null with an expected revision", async (type) => {
  const data = normalizeAcademicData(type, {});
  m.read.mockResolvedValue({ documents: [{ id: "doc", document_type: type, structured_data: data }] });
  expect((await PATCH(request({ documentId: "doc", revision: 1, data, provenance: { page: 999 } }), context)).status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith("save_extraction_draft", expect.objectContaining({ p_expected_revision: 1, p_data: data }));
  expect(m.rpc.mock.calls[0][1]).not.toHaveProperty("provenance");
});
it.each([null, -1, 1.5, "1"])("rejects invalid draft revision %j", async (revision) => {
  expect((await PATCH(request({ revision, notes: {} }), context)).status).toBe(400);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("protects subject identity and rejects category changes or invalid score edits", async () => {
  const data = normalizeAcademicData("form_137", { subjects: [{ name: "Math", year: "2025", grade: 80 }] });
  m.read.mockResolvedValue({ documents: [{ id: "doc", document_type: "form_137", structured_data: data }] });
  for (const changed of [normalizeAcademicData("nat", {}), { type: "form_137", data: { subjects: [{ name: "Science", year: "2025", grade: 80 }] } }, { type: "form_137", data: { subjects: [{ name: "Math", year: "2025", grade: 900 }] } }]) {
    expect((await PATCH(request({ documentId: "doc", revision: 1, data: changed }), context)).status).toBe(400);
  }
  expect(m.rpc).not.toHaveBeenCalled();
});
it("saves incomplete notes as a draft without approving or accepting forged extraction provenance", async () => {
  expect((await PATCH(request({ revision: 1, notes: { careerGoal: "", interests: "Math" }, source: { page: 99 }, reviewed: true }), context)).status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith("save_intake_notes", expect.objectContaining({ p_source: null, p_extracted: false, p_notes: { careerGoal: "", interests: "Math", financial: "", concerns: "", impression: "" } }));
});
it("retains editable values after persistence failure, returning an actionable error", async () => {
  m.rpc.mockRejectedValue(new Error("SECRET RAW DATABASE CONTENT"));
  const response = await PATCH(request({ revision: 1, notes: {} }), context);
  expect(response.status).toBe(500);
  expect(await response.text()).toContain("Retry saving");
});
it("returns a conflict for a stale draft or approved-session edit", async () => {
  m.rpc.mockRejectedValue(new UploadValidationError("Reload before retrying.", 409));
  expect((await PATCH(request({ revision: 1, notes: {} }), context)).status).toBe(409);
});
it("denies unauthenticated and foreign sessions before parsing request bodies", async () => {
  m.user.mockResolvedValueOnce(null);
  let req = request({ revision: 1 });
  expect((await PATCH(req, context)).status).toBe(401); expect(req.bodyUsed).toBe(false);
  m.owns.mockResolvedValueOnce(false); req = request({ revision: 1 });
  expect((await PATCH(req, context)).status).toBe(404); expect(req.bodyUsed).toBe(false);
});
it("bounds JSON before parsing and rejects missing/malformed bodies", async () => {
  expect((await PATCH(request({ revision: 1, notes: { careerGoal: "x".repeat(200_000) } }), context)).status).toBe(413);
  expect((await PATCH(new NextRequest("http://localhost", { method: "PATCH", body: "{" }), context)).status).toBe(400);
  expect(m.rpc).not.toHaveBeenCalled();
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { buildAndSave, requireUser, userOwnsSession } = vi.hoisted(() => {
  process.env.DOCUMENT_INTAKE_API_KEY = "synthetic-test-key";
  return {
  buildAndSave: vi.fn(), requireUser: vi.fn(), userOwnsSession: vi.fn(),
  };
});
vi.mock("@/lib/module2/student-profile-builder", () => ({ studentProfileBuilder: { buildAndSave } }));
vi.mock("@/lib/auth/api-auth", () => ({
  requireUser, userOwnsSession,
  unauthorizedResponse: () => Response.json({}, { status: 401 }),
  notFoundResponse: () => Response.json({}, { status: 404 }),
}));
import { POST as approve } from "@/app/api/sessions/[sessionId]/approve/route";
import { POST as extract } from "@/app/api/extract-notes/route";

vi.mock("@/lib/module2/intake-draft-store", () => ({
  draftHeaders: { "Cache-Control": "private, no-store" },
  readIntakeDraft: vi.fn(async () => ({ documents: [], notes: { revision: 0 } })),
  intakeRpc: vi.fn(async () => ({ draft_revision: 1 })),
}));
import { imageFixture } from "../tests/upload-fixtures";

const valid = { careerGoal: "<p>Undecided</p>", interests: "<ul><li>Mathematics</li></ul>", financial: "", concerns: "", impression: "" };
const request = (counselorNotes: unknown, notesReviewed: unknown = true) => approve(
  new NextRequest("http://localhost/api/sessions/test/approve", { method: "POST", body: JSON.stringify({ counselorNotes, notesReviewed }) }),
  { params: Promise.resolve({ sessionId: "test" }) },
);

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "counselor" });
  userOwnsSession.mockResolvedValue(true);
  buildAndSave.mockImplementation(async (input) => input);
});

describe("F04 approval notes contract", () => {
  it.each(["financial", "concerns", "impression"])("accepts blank %s independently", async (field) => {
    const notes = { ...valid, financial: "Support", concerns: "Reviewed", impression: "Reviewed", [field]: "" };
    expect((await request(notes)).status).toBe(200);
    expect(buildAndSave).toHaveBeenCalledWith(expect.objectContaining({ counselorNotes: notes }));
  });
  it("accepts all optional fields omitted without inventing values", async () => {
    expect((await request({ careerGoal: valid.careerGoal, interests: valid.interests })).status).toBe(200);
    expect(buildAndSave.mock.calls[0][0].counselorNotes).toEqual(valid);
  });
  it.each(["careerGoal", "interests"])("rejects missing, whitespace and markup-only %s", async (field) => {
    for (const value of [undefined, "", " \n ", "<p><br></p>", "<p>&nbsp;&#160;&#xA0;</p>", "<b>\u200b</b>"]) {
      expect((await request({ ...valid, [field]: value })).status).toBe(400);
    }
    expect(buildAndSave).not.toHaveBeenCalled();
  });
  it.each([undefined, null, {}, [], { ...valid, financial: 1 }])("rejects malformed notes %j", async (notes) => {
    expect((await request(notes)).status).toBe(400);
    expect(buildAndSave).not.toHaveBeenCalled();
  });
  it.each([false, "true", null])("rejects review confirmation %j", async (reviewed) => {
    expect((await request(valid, reviewed)).status).toBe(400);
    expect(buildAndSave).not.toHaveBeenCalled();
  });
  it("retains authentication and owner checks", async () => {
    requireUser.mockResolvedValueOnce(null);
    expect((await request(valid)).status).toBe(401);
    userOwnsSession.mockResolvedValueOnce(false);
    expect((await request(valid)).status).toBe(404);
    expect(buildAndSave).not.toHaveBeenCalled();
  });
  it.each(["Grade 10 choosing an SHS track", "SHS planning higher education or workforce entry"])("accepts typed-only %s without extraction", async (scope) => {
    const outbound = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected extraction"));
    try {
      expect((await request({ ...valid, interests: `<p>${scope}; mathematics</p>` })).status).toBe(200);
      expect(outbound).not.toHaveBeenCalled();
    } finally { outbound.mockRestore(); }
  });
});

describe("F05 photographed-note review", () => {
  it("retains reviewed photograph extraction and returns blank optional fields for editing", async () => {
    const outbound = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(valid) }] } }],
    }));
    const form = new FormData();
    form.append("file", new File([new Uint8Array(await imageFixture("png"))], "notes.png", { type: "image/png" }));
    form.append("notesReviewed", "true");
    form.append("sessionId", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    form.append("revision", "0");
    try {
      const result = await extract(new NextRequest("http://localhost/api/extract-notes", { method: "POST", body: form }));
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({ ...valid, revision: 1, source: { page: 1 } });
      expect(outbound).toHaveBeenCalledTimes(1);
    } finally { outbound.mockRestore(); }
  });
  it.each([null, "false"])("blocks extraction without explicit review (%s) before external processing", async (reviewed) => {
    const outbound = vi.spyOn(globalThis, "fetch");
    const form = new FormData();
    form.append("file", new File(["synthetic"], "notes.png", { type: "image/png" }));
    if (reviewed !== null) form.append("notesReviewed", reviewed);
    try {
      const result = await extract(new NextRequest("http://localhost/api/extract-notes", { method: "POST", body: form }));
      expect(result.status).toBe(400);
      expect(outbound).not.toHaveBeenCalled();
    } finally { outbound.mockRestore(); }
  });
});

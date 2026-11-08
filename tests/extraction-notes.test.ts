import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), fetch: vi.fn(), download: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { storage: { from: () => ({ download: mock.download }) } } }));
vi.mock("@/lib/module2/extraction-cleanup", () => ({ drainExtractionCleanup: mock.cleanup }));
vi.mock("@/lib/auth/api-auth", () => ({ requireUser: async () => ({ id: "owner-sentinel" }),
  userOwnsSession: async () => true, unauthorizedResponse: () => new Response(null, { status: 401 }), notFoundResponse: () => new Response(null, { status: 404 }) }));
vi.mock("@/lib/module2/intake-draft-store", () => ({ intakeRpc: mock.rpc,
  readIntakeDraft: async () => ({ notes: { revision: 0 } }), draftHeaders: { "Cache-Control": "private, no-store" } }));
import { POST } from "@/app/api/extract-notes/route";
import { corpusRoot, sha256 } from "../scripts/extraction/corpus";
const fixture = JSON.parse(readFileSync(new URL("notes-approved.json", corpusRoot), "utf8"));
const bytes = readFileSync(new URL(fixture.file, corpusRoot));
function upload(reviewed = true) {
  const form = new FormData();
  form.set("file", new File([bytes], "PRIVATE-NAME-SENTINEL.jpg", { type: "image/jpeg" }));
  form.set("sessionId", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"); form.set("revision", "0");
  if (reviewed) form.set("notesReviewed", "true");
  return new NextRequest("https://app.test/api/extract-notes", { method: "POST", body: form });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("DOCUMENT_INTAKE_API_KEY", "notes-intake-secret");
  mock.rpc.mockResolvedValue({ draft_revision: 1 });
  mock.cleanup.mockResolvedValue({ failed: 0, pending: false });
  mock.fetch.mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...fixture.expected, debug: "PRIVATE-RESPONSE" }) }] } }] }));
  vi.stubGlobal("fetch", mock.fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("mocked notes contract: approved synthetic photograph goes unchanged through the configured intake endpoint", async () => {
  expect(sha256(bytes)).toBe(fixture.sha256);
  const response = await POST(upload());
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  const [url, init] = mock.fetch.mock.calls[0];
  expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  expect(init.headers["x-goog-api-key"]).toBe("notes-intake-secret");
  const parts = JSON.parse(init.body).contents[0].parts;
  expect(parts).toHaveLength(2);
  expect(parts[1]).toEqual({ inlineData: { mimeType: "image/jpeg", data: bytes.toString("base64") } });
  expect(init.body).not.toMatch(/owner-sentinel|PRIVATE-NAME-SENTINEL|aaaaaaaa-aaaa|notes-intake-secret/);
  const result = await response.json();
  expect(result).toMatchObject(fixture.expected); expect(result).not.toHaveProperty("debug");
  expect(mock.rpc.mock.calls[0][1].p_notes).toEqual(fixture.expected);
});
it("requires counselor review before transmitting the photograph", async () => {
  expect((await POST(upload(false))).status).toBe(400);
  expect(mock.fetch).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled();
});
it.each(["provider", "malformed", "cancelled-session"])("mocked notes %s failure retains safe logs and no raw persisted artifact", async mode => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  if (mode === "provider") mock.fetch.mockResolvedValue(Response.json({ error: { message: "PRIVATE-RESPONSE" } }, { status: 401 }));
  if (mode === "malformed") mock.fetch.mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: "PRIVATE-RESPONSE" }] } }] }));
  if (mode === "cancelled-session") mock.rpc.mockRejectedValue(new Error("PRIVATE-RESPONSE"));
  const response = await POST(upload());
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(await response.text()).not.toMatch(/PRIVATE-RESPONSE|notes-intake-secret|PRIVATE-NAME/);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/PRIVATE-RESPONSE|notes-intake-secret|PRIVATE-NAME/);
  if (mode !== "cancelled-session") expect(mock.rpc).not.toHaveBeenCalled();
});
it("extracts staged notes only for their saved revision and cleans the raw photograph after saving", async () => {
  const uploadId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  mock.rpc.mockImplementation(async (name: string) => name === "claim_temporary_upload" ? {
    id: uploadId, session_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", counselor_id: "owner-sentinel",
    object_path: `session/${uploadId}`, document_type: "notes", notes_revision: 0, file_size: bytes.length, mime_type: "image/jpeg",
  } : { draft_revision: 1 });
  mock.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  const response = await POST(new NextRequest("https://app.test/api/extract-notes", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId,
      sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision: 0, notesReviewed: true }) }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ...fixture.expected, cleanupPending: false });
  expect(mock.rpc).toHaveBeenCalledWith("finish_temporary_upload", expect.objectContaining({ p_id: uploadId }));
});

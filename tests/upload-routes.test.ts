import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { imageFixture, pdfFixture, uploadRequest } from "./upload-fixtures";
import { MAX_ACADEMIC_FILE_BYTES, MAX_ACADEMIC_REQUEST_BYTES } from "@/lib/academic-upload-policy";
import { UploadValidationError } from "@/lib/module2/academic-upload-validation";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), owns: vi.fn(), redact: vi.fn(), store: vi.fn(), delete: vi.fn(), extract: vi.fn(),
  claim: vi.fn(), release: vi.fn(), remove: vi.fn(), activity: vi.fn(), progress: vi.fn(),
}));
vi.mock("@/lib/auth/api-auth", () => ({
  requireUser: mocks.user, userOwnsSession: mocks.owns,
  unauthorizedResponse: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
  notFoundResponse: () => Response.json({ error: "Not found" }, { status: 404 }),
}));
vi.mock("@/lib/module2/pii-redaction-service", () => ({ piiRedactionService: { redact: mocks.redact } }));
vi.mock("@/lib/module2/document-storage-service", () => ({ documentStorageService: { storeRedacted: mocks.store, deleteRedacted: mocks.delete } }));
vi.mock("@/lib/module2/gemini-extraction-service", () => ({ geminiExtractionService: { extract: mocks.extract } }));
vi.mock("@/lib/module2/academic-document-store", () => ({ academicDocumentStore: { claim: mocks.claim, release: mocks.release, remove: mocks.remove } }));
vi.mock("@/lib/module2/session-initialization-service", () => ({ sessionInitializationService: { updateLastActivity: mocks.activity } }));
vi.mock("@/lib/module5/session-progress", () => ({ sessionProgressTracker: { markIntakeInProgress: mocks.progress } }));

const context = { params: Promise.resolve({ sessionId: "session-a" }) };
const docId = "00000000-0000-4000-8000-000000000001";
const claim = { id: "row-a", token: "token-a", previousPath: null as string | null };
let sessionPost: typeof import("@/app/api/sessions/[sessionId]/upload/route").POST;
let sessionDelete: typeof import("@/app/api/sessions/[sessionId]/upload/route").DELETE;
let legacyPost: typeof import("@/app/api/extract-document/route").POST;
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv("DOCUMENT_INTAKE_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] })));
  mocks.user.mockResolvedValue({ id: "owner-a" }); mocks.owns.mockResolvedValue(true);
  mocks.claim.mockResolvedValue({ ...claim }); mocks.release.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined); mocks.delete.mockResolvedValue(undefined);
  mocks.redact.mockResolvedValue({ redactedBuffer: Buffer.from("redacted"), piiCount: 0 });
  mocks.store.mockResolvedValue("session-a/new.jpg"); mocks.extract.mockResolvedValue({ id: "row-a", structured_data: { type: "nat", data: {} } });
  ({ POST: sessionPost, DELETE: sessionDelete } = await import("@/app/api/sessions/[sessionId]/upload/route"));
  ({ POST: legacyPost } = await import("@/app/api/extract-document/route"));
});

for (const route of ["session", "legacy"] as const) {
  const post = (request: Request) => route === "session" ? sessionPost(request as NextRequest, context) : legacyPost(request as NextRequest);
  describe(`${route} route before extraction`, () => {
    for (const size of [MAX_ACADEMIC_FILE_BYTES - 1, MAX_ACADEMIC_FILE_BYTES, MAX_ACADEMIC_FILE_BYTES + 1]) {
      it(`returns ${size > MAX_ACADEMIC_FILE_BYTES ? 413 : 200} for ${size} bytes`, async () => {
        const response = await post(uploadRequest(pdfFixture(size)));
        expect(response.status).toBe(size > MAX_ACADEMIC_FILE_BYTES ? 413 : 200);
        if (size > MAX_ACADEMIC_FILE_BYTES) {
          expect((await response.json()).error).toContain("10,000,000 bytes");
          expect(mocks.redact).not.toHaveBeenCalled(); expect(mocks.extract).not.toHaveBeenCalled();
          expect(fetch).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled();
        }
      });
    }
    it("returns 413 for oversized declared, chunked and parser-rejected bodies without processing", async () => {
      const headers = { "content-type": "multipart/form-data; boundary=x" };
      const requests = [
        new Request("http://localhost/upload", { method: "POST", headers: { ...headers, "content-length": String(MAX_ACADEMIC_REQUEST_BYTES + 1) }, body: "x" }),
        new Request("http://localhost/upload", { method: "POST", headers, body: new Uint8Array(MAX_ACADEMIC_REQUEST_BYTES + 1) }),
        new Request("http://localhost/upload", { method: "POST", headers, body: new ReadableStream({ start(controller) { controller.error(new Error("Body exceeded 10 MB limit")); } }), duplex: "half" } as RequestInit),
      ];
      for (const request of requests) expect((await post(request)).status).toBe(413);
      expect(mocks.redact).not.toHaveBeenCalled(); expect(mocks.extract).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled();
    });
    it("returns actionable 415 for a disguised or corrupt file, without any AI call", async () => {
      for (const buffer of [Buffer.from("MZ renamed.exe"), Buffer.from("%PDF-1.7\ncorrupt\n%%EOF")]) {
        const response = await post(uploadRequest(buffer));
        expect(response.status).toBe(415); expect((await response.json()).error).toContain("retry");
      }
      expect(mocks.redact).not.toHaveBeenCalled(); expect(mocks.extract).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    });
    it("keeps authentication ahead of reading or processing uploads", async () => {
      mocks.user.mockResolvedValue(null);
      const request = uploadRequest(pdfFixture());
      expect((await post(request)).status).toBe(401); expect(request.bodyUsed).toBe(false);
    });
  });
}

it("rejects duplicates before redaction/extraction", async () => {
  mocks.claim.mockRejectedValue(new UploadValidationError("Use Replace on the current file", 409));
  expect((await sessionPost(uploadRequest(pdfFixture()) as NextRequest, context)).status).toBe(409);
  expect(mocks.redact).not.toHaveBeenCalled(); expect(mocks.extract).not.toHaveBeenCalled();
});
it("sends detected MIME to redaction, and explicitly replaces the current document", async () => {
  mocks.claim.mockResolvedValue({ ...claim, previousPath: `session-a/${docId}.jpg` });
  const response = await sessionPost(uploadRequest(await imageFixture("webp"), "image/webp", "nat", docId) as NextRequest, context);
  expect(response.status).toBe(200);
  expect(mocks.claim).toHaveBeenCalledWith("session-a", "owner-a", "nat", docId);
  expect(mocks.redact.mock.calls[0][1]).toBe("image/webp");
  expect(mocks.delete).toHaveBeenCalledWith(`session-a/${docId}.jpg`);
  expect(mocks.release).not.toHaveBeenCalled();
});
it("renders a PDF to a decodable all-page image before the existing redaction pipeline", async () => {
  const response = await sessionPost(uploadRequest(pdfFixture()) as NextRequest, context);
  expect(response.status).toBe(200);
  expect(mocks.redact.mock.calls[0][1]).toBe("image/jpeg");
  const { default: sharp } = await import("sharp");
  expect((await sharp(mocks.redact.mock.calls[0][0]).metadata()).format).toBe("jpeg");
});
it("failed extraction releases the claim, deletes only the new image, and preserves the prior file", async () => {
  const replacement = { ...claim, previousPath: `session-a/${docId}.jpg` };
  mocks.claim.mockResolvedValue(replacement); mocks.extract.mockRejectedValue(new Error("Extraction unavailable"));
  const response = await sessionPost(uploadRequest(pdfFixture(), "application/pdf", "nat", docId) as NextRequest, context);
  expect(response.status).toBe(500); expect((await response.json()).error).toContain("preserved");
  expect(mocks.release).toHaveBeenCalledWith(replacement); expect(mocks.delete).toHaveBeenCalledExactlyOnceWith("session-a/new.jpg");
});
it("removes the persisted extraction, so approval cannot reload removed values", async () => {
  mocks.claim.mockResolvedValue({ ...claim, previousPath: `session-a/${docId}.jpg` });
  const request = new NextRequest(`http://localhost/upload?docType=nat&documentId=${docId}`, { method: "DELETE" });
  expect((await sessionDelete(request, context)).status).toBe(200);
  expect(mocks.remove).toHaveBeenCalledOnce(); expect(mocks.delete).toHaveBeenCalledWith(`session-a/${docId}.jpg`);
  expect(mocks.extract).not.toHaveBeenCalled();
});
it("denies a foreign session before body parsing or removal", async () => {
  mocks.owns.mockResolvedValue(false);
  const request = uploadRequest(pdfFixture());
  expect((await sessionPost(request as NextRequest, context)).status).toBe(404); expect(request.bodyUsed).toBe(false);
  expect((await sessionDelete(new NextRequest(`http://localhost/upload?docType=nat&documentId=${docId}`, { method: "DELETE" }), context)).status).toBe(404);
  expect(mocks.claim).not.toHaveBeenCalled();
});

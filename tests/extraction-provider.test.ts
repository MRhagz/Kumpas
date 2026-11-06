import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const persistence = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/module2/intake-draft-store", () => ({ intakeRpc: persistence.rpc }));
import { geminiExtractionService } from "@/lib/module2/gemini-extraction-service";
import { corpusRoot, loadCorpus } from "../scripts/extraction/corpus";

const claim = { id: "document-sentinel", token: "lease-sentinel", sessionId: "session-sentinel", counselorId: "owner-sentinel" };
const fixture = loadCorpus().fixtures.find(f => f.category === "nat" && f.format === "png")!;
const bytes = readFileSync(new URL(fixture.file, corpusRoot));
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DOCUMENT_INTAKE_API_KEY", "intake-secret-sentinel");
  vi.stubEnv("SYNTHESIS_API_KEY", "synthesis-secret-sentinel");
  request = vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [
    { thought: true, text: "private-thought-sentinel" },
    { text: JSON.stringify({ evidence_state: "provided", data: { subjects: { Mathematics: 0 }, composite_score: null, private_debug: "raw-response-sentinel" } }) },
  ] } }] }));
  vi.stubGlobal("fetch", request);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const extract = () => geminiExtractionService.extract(bytes, "nat", claim.sessionId, claim.counselorId, "image/png", claim);

it("mocked HTTP contract: sends the approved image unchanged, prompt only, and the isolated intake credential", async () => {
  await extract();
  const [url, init] = request.mock.calls[0];
  expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  expect(init.redirect).toBe("error");
  expect(init.headers).toEqual({ "Content-Type": "application/json", "x-goog-api-key": "intake-secret-sentinel" });
  const body = JSON.parse(init.body);
  expect(Object.keys(body).sort()).toEqual(["contents", "generationConfig"]);
  expect(body.contents).toHaveLength(1);
  expect(body.contents[0].parts).toHaveLength(2);
  expect(body.contents[0].parts[1]).toEqual({ inlineData: { mimeType: "image/png", data: bytes.toString("base64") } });
  // Synthetic identifiers in the pixels are allowed by SW-05; do not assert masking.
  for (const marker of Object.values(claim).concat(["synthesis-secret-sentinel", "intake-secret-sentinel"])) expect(init.body).not.toContain(marker);
  const [operation, saved] = persistence.rpc.mock.calls[0];
  expect(operation).toBe("finish_academic_upload");
  expect(saved.p_data).toEqual({ type: "nat", data: { subjects: { Mathematics: 0 }, composite_score: null, mastery_level: null } });
  expect(saved.p_provenance).toMatchObject({ model: "gemini-3.8-flash", promptVersion: "sw06-v1", page: null });
  expect(JSON.stringify(saved)).not.toMatch(/private-thought-sentinel|raw-response-sentinel|inlineData/);
});

it.each(["transport", "authentication", "malformed", "cancelled-save"])("mocked %s failure exposes no raw diagnostic and never stores provider bodies", async mode => {
  const log = vi.spyOn(console, "error");
  if (mode === "transport") request.mockRejectedValue(new Error("PRIVATE-URL?key=intake-secret-sentinel"));
  if (mode === "authentication") request.mockResolvedValue(Response.json({ error: { message: "PRIVATE RAW BODY" } }, { status: 401 }));
  if (mode === "malformed") request.mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: "PRIVATE NON JSON" }] } }] }));
  if (mode === "cancelled-save") persistence.rpc.mockRejectedValueOnce(new Error("Session no longer available"));
  await expect(extract()).rejects.not.toThrow(/PRIVATE|intake-secret-sentinel/);
  if (mode !== "cancelled-save") expect(persistence.rpc).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

it("rejects missing intake credentials without falling back to another operation's key", async () => {
  vi.stubEnv("DOCUMENT_INTAKE_API_KEY", "");
  await expect(extract()).rejects.toThrow("API key is missing");
  expect(request).not.toHaveBeenCalled(); expect(persistence.rpc).not.toHaveBeenCalled();
});

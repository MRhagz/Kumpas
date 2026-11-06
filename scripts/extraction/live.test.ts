// This file is intentionally outside ordinary test discovery. Only test:extraction:live
// executes it. Gemini is real; persistence is an in-memory contract adapter.
import { readFileSync, mkdirSync, writeFileSync, lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
const database = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../src/lib/module2/intake-draft-store", () => ({ intakeRpc: database.rpc }));
import { geminiExtractionService } from "../../src/lib/module2/gemini-extraction-service";
import { renderAcademicPdf } from "../../src/lib/module2/academic-pdf-renderer";
import { validateAcademicContent } from "../../src/lib/module2/academic-upload-validation";
import { EXTRACTION_PROMPT_VERSION } from "../../src/lib/module2/extraction-contract";
import { getGeminiApiVersion, getGeminiGenerationModel } from "../../src/lib/module3/gemini-config";
import { corpusRoot, loadCorpus, sha256 } from "./corpus";
import { evaluate } from "./evaluate";
import type { ExtractedAcademicData, ExtractionDraft } from "../../src/types";

it("evaluates the frozen synthetic corpus through REAL paid-project Gemini extraction", async () => {
  if (process.env.SW28_LIVE !== "paid-synthetic-corpus") throw new Error("Live calls disabled. Read docs/sw-28-verification.md and set SW28_LIVE explicitly.");
  if (!process.env.DOCUMENT_INTAKE_API_KEY?.trim()) throw new Error("DOCUMENT_INTAKE_API_KEY is required; no credential fallback.");
  if (Object.keys(process.env).some(name => /^NEXT_PUBLIC_.*(?:GEMINI|API_KEY|SERVICE_ROLE|SECRET)/.test(name))) throw new Error("Publicly named privileged credential is forbidden.");
  if (!process.env.SW28_PROJECT_EVIDENCE) throw new Error("SW28_PROJECT_EVIDENCE must reference private, reviewed project/billing evidence.");
  let evidenceBytes: Buffer;
  let evidence;
  try {
    evidenceBytes = readFileSync(process.env.SW28_PROJECT_EVIDENCE);
    evidence = JSON.parse(evidenceBytes.toString());
  } catch { throw new Error("Private project evidence is unreadable or invalid JSON"); }
  if (!evidence || typeof evidence !== "object" || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(evidence.projectId ?? "") || evidence.billingEnabled !== true ||
      evidence.credentialEnv !== "DOCUMENT_INTAKE_API_KEY" || !evidence.verifiedBy || !Number.isFinite(Date.parse(evidence.verifiedAt)) || !evidence.evidenceReference) {
    throw new Error("Project evidence must identify the billing-enabled project, intake credential mapping, verifier, time and console evidence reference.");
  }
  const corpus = loadCorpus(); // Validate every frozen hash before the first paid call.
  const model = getGeminiGenerationModel();
  const apiVersion = getGeminiApiVersion();
  const build = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim().length > 0;
  const sources = ["src/lib/module2/gemini-extraction-service.ts", "src/lib/module2/extraction-contract.ts",
    "src/lib/module3/gemini-config.ts", "src/lib/module2/academic-upload-validation.ts", "src/lib/module2/academic-pdf-renderer.ts",
    "scripts/extraction/score.ts", "scripts/extraction/evaluate.ts", "scripts/extraction/live.test.ts"];
  const sourceHashes = Object.fromEntries(sources.map(path => [path, sha256(readFileSync(new URL(`../../${path}`, import.meta.url)))]));
  const privateRoot = new URL("../../.private/", import.meta.url);
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  if (lstatSync(privateRoot).isSymbolicLink()) throw new Error("Private evidence root must not be a symlink");
  const output = new URL("../../.private/sw28/", import.meta.url);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  if (lstatSync(output).isSymbolicLink()) throw new Error("Evidence output must not be a symlink");
  const reportFile = new URL(`${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID()}.json`, output);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const nativeFetch = globalThis.fetch;
  let providerRequests = 0;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    if (url !== `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent` ||
        init.redirect !== "error" || new Headers(init.headers).get("x-goog-api-key") !== process.env.DOCUMENT_INTAKE_API_KEY?.trim()) {
      throw new Error("Unexpected provider routing");
    }
    providerRequests++;
    return nativeFetch(url, { ...init, signal: AbortSignal.any([controller.signal, ...(init.signal ? [init.signal] : [])]) });
  });
  database.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name !== "finish_academic_upload") throw new Error("Unexpected persistence operation");
    return { structured_data: args.p_data, evidence_state: args.p_evidence };
  });
  process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  const startedAt = new Date().toISOString();
  try {
    const result = await evaluate(corpus.fixtures, async fixture => {
      const bytes = readFileSync(new URL(fixture.file, corpusRoot));
      if (sha256(bytes) !== fixture.sha256) throw new Error("Fixture changed after preflight");
      const mime = await validateAcademicContent(bytes, fixture.mimeType);
      const image = mime === "application/pdf" ? await renderAcademicPdf(bytes) : bytes;
      const draft: ExtractionDraft = await geminiExtractionService.extract(image, fixture.category,
        "sw28-synthetic-session", "sw28-synthetic-counselor", mime === "application/pdf" ? "image/jpeg" : mime,
        { id: fixture.id, token: "sw28-synthetic-lease", sessionId: "sw28-synthetic-session", counselorId: "sw28-synthetic-counselor" });
      return draft.evidence_state === "provided" ? draft.structured_data as ExtractedAcademicData : null;
    }, controller.signal);
    const report = { execution: "live_gemini_mocked_persistence", startedAt, finishedAt: new Date().toISOString(),
      build, dirty, model, apiVersion, promptVersion: EXTRACTION_PROMPT_VERSION,
      sourceHashes,
      corpusVersion: corpus.version, manifestSha256: corpus.manifestSha256, providerRequests,
      project: { projectId: evidence.projectId, evidenceSha256: sha256(evidenceBytes),
        verification: "operator-supplied console/key-mapping record; runner cannot independently inspect billing or key ownership" },
      localRedaction: { status: "waived", basis: "SW-05 team scope decision", cases: ["I01 pre-upload masking", "I01 redaction/deletion-before-release gate"] },
      independentGroundTruthReview: corpus.independentGroundTruthReview,
      releaseReady: false, // Live extraction alone never establishes integrated release acceptance.
      ...result };
    // This private report contains only synthetic field mismatches and safe error
    // codes, never image bytes, credentials, raw replies or provider error bodies.
    writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    console.log(`SW-28 live report: ${reportFile.pathname}; ${result.overall.correct}/${result.overall.total} fields; failures=${result.overall.failures}`);
    expect(result.extractionGateMet, "Live extraction gate failed; inspect the private mismatch report").toBe(true);
  } finally {
    controller.abort();
    process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
    database.rpc.mockReset(); vi.unstubAllGlobals();
  }
}, 30 * 310_000);

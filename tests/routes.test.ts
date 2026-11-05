import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const m = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), maybeSingle: vi.fn(), from: vi.fn(),
  readState: vi.fn(), downloadPdf: vi.fn(), downloadImage: vi.fn(),
  createSession: vi.fn(), createNotes: vi.fn(), cleanup: vi.fn(), retention: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: m.getUser }, rpc: m.rpc }) }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: m.from } }));
vi.mock("@/lib/module2/session-initialization-service", () => ({ sessionInitializationService: {
  createSession: m.createSession, createSessionNotes: m.createNotes,
} }));
vi.mock("@/lib/module2/pii-redaction-service", () => ({ piiRedactionService: {} }));
vi.mock("@/lib/module2/gemini-extraction-service", () => ({ geminiExtractionService: {} }));
vi.mock("@/lib/module2/student-profile-builder", () => ({ studentProfileBuilder: {} }));
vi.mock("@/lib/module3/agent-dispatcher", () => ({ agentDispatcher: {} }));
vi.mock("@/lib/module3/meta-agent-synthesizer", () => ({ metaAgentSynthesizer: {} }));
vi.mock("@/lib/module5/session-progress", () => ({ sessionProgressTracker: {} }));
vi.mock("@/lib/module5/session-state-manager", () => ({ sessionStateManager: { getSessionState: m.readState } }));
vi.mock("@/lib/report/session-termination", () => ({ sessionTerminationHandler: {} }));
vi.mock("@/lib/report/session-completion", () => ({ sessionCompletionService: {} }));
vi.mock("@/lib/report/assembler", () => ({ assembleReportData: vi.fn(), ReportAssemblyError: class extends Error {} }));
vi.mock("@/lib/report/pdf-renderer", () => ({ renderReportPdf: vi.fn() }));
vi.mock("@/lib/report/file-store", () => ({
  normalizeReportSessionId: (id: string) => id.trim(), pdfFileStore: { downloadReportPdf: m.downloadPdf },
}));
vi.mock("@/lib/module2/document-storage-service", () => ({ documentStorageService: { retrieveRedacted: m.downloadImage } }));
vi.mock("@/lib/module5/expired-session-cleanup", () => ({ runExpiredSessionCleanup: m.cleanup }));
vi.mock("@/lib/report/retention-cleanup", () => ({ runReportRetentionCleanup: m.retention }));

import * as sessions from "@/app/api/sessions/route";
import * as session from "@/app/api/sessions/[sessionId]/route";
import * as analyze from "@/app/api/sessions/[sessionId]/analyze/route";
import * as approve from "@/app/api/sessions/[sessionId]/approve/route";
import * as complete from "@/app/api/sessions/[sessionId]/complete/route";
import * as upload from "@/app/api/sessions/[sessionId]/upload/route";
import * as reports from "@/app/api/reports/route";
import * as pdf from "@/app/api/reports/[sessionId]/route";
import * as image from "@/app/api/sessions/[sessionId]/documents/[documentId]/route";
import * as extractDocument from "@/app/api/extract-document/route";
import * as extractNotes from "@/app/api/extract-notes/route";
import * as freshness from "@/app/api/ingestion/freshness/route";
import * as cleanup from "@/app/api/sessions/expired/route";
import * as retention from "@/app/api/reports/retention/route";

const ownerId = "11111111-1111-4111-8111-111111111111";
const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const documentId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const owner = { id: ownerId, email: "a@example.test", invited_at: "2026-01-01", email_confirmed_at: "2026-01-01",
  app_metadata: { role: "counselor", counselor_activated: true }, user_metadata: {} };
const context = { params: Promise.resolve({ sessionId, documentId }) };
const ownedRoutes = [
  ["GET", "/api/sessions/id", session.GET], ["DELETE", "/api/sessions/id", session.DELETE],
  ["POST", "/api/sessions/id/analyze", analyze.POST], ["POST", "/api/sessions/id/approve", approve.POST],
  ["POST", "/api/sessions/id/complete", complete.POST], ["POST", "/api/sessions/id/upload", upload.POST],
  ["DELETE", "/api/sessions/id/upload", upload.DELETE],
  ["POST", "/api/reports", reports.POST],
  ["GET", "/api/reports/id", pdf.GET], ["GET", "/api/reports/id?download=1", pdf.GET],
  ["GET", "/api/sessions/id/documents/id", image.GET],
] as const;
const routes = [...ownedRoutes,
  ["POST", "/api/sessions", sessions.POST], ["POST", "/api/extract-document", extractDocument.POST],
  ["POST", "/api/extract-notes", extractNotes.POST], ["GET", "/api/ingestion/freshness", freshness.GET],
] as const;
function request(method: string, path: string) {
  return new NextRequest(`https://kumpas.example.test${path}`, { method,
    ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.getUser.mockResolvedValue({ data: { user: owner }, error: null });
  m.rpc.mockResolvedValue({ data: "active", error: null });
  m.maybeSingle.mockResolvedValue({ data: { counselor_id: ownerId, status: "active", expires_at: "2099-01-01" }, error: null });
  m.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: m.maybeSingle }) }) });
});
describe("F01/I03 protected route inventory", () => {
  it("inventories every exported API handler, including maintenance", () => {
    const root = fileURLToPath(new URL("../src/app/api", import.meta.url));
    const discovered: string[] = [];
    function scan(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) scan(path);
        else if (entry.name === "route.ts") {
          const route = "/api/" + relative(root, directory).split(sep).join("/");
          for (const match of readFileSync(path, "utf8").matchAll(/export async function (GET|POST|DELETE|PUT|PATCH)\(/g)) {
            discovered.push(`${match[1]} ${route}`);
          }
        }
      }
    }
    scan(root);
    const covered = new Set(routes.map(([method, path]) => `${method} ${path.split("?")[0]
      .replace("/sessions/id", "/sessions/[sessionId]").replace("/documents/id", "/documents/[documentId]")
      .replace("/reports/id", "/reports/[sessionId]")}`));
    for (const path of ["/api/sessions/expired", "/api/reports/retention"]) {
      for (const method of ["GET", "POST"]) covered.add(`${method} ${path}`);
    }
    expect([...covered].sort()).toEqual(discovered.sort());
  });
  for (const [variant, user, error, access] of [
    ["missing token", null, null, "active"],
    ["expired token", owner, { message: "JWT expired" }, "active"],
    ["tampered token", null, { message: "JWT invalid" }, "active"],
    ["uninvited signup", { ...owner, invited_at: undefined }, null, "active"],
    ["wrong role", { ...owner, app_metadata: { role: "student" } }, null, "active"],
    ["revoked session", owner, null, null],
  ] as const) {
    for (const [method, path, handler] of routes) {
      it(`${variant}: ${method} ${path} grants no data or operation`, async () => {
        m.getUser.mockResolvedValue({ data: { user }, error });
        m.rpc.mockResolvedValue({ data: access, error: null });
        const response = await handler(request(method, path), context);
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
        expect(m.from).not.toHaveBeenCalled();
        expect(m.createSession).not.toHaveBeenCalled();
        expect(m.downloadPdf).not.toHaveBeenCalled();
        expect(m.downloadImage).not.toHaveBeenCalled();
      });
    }
  }
  for (const [method, path, handler] of ownedRoutes) {
    it(`expired saved session: ${method} ${path} exposes no artifact`, async () => {
      m.maybeSingle.mockResolvedValue({ data: { counselor_id: ownerId, status: "active", expires_at: "2000-01-01" }, error: null });
      const response = await handler(request(method, path), context);
      expect(response.status).toBe(404);
      expect(m.downloadPdf).not.toHaveBeenCalled();
      expect(m.downloadImage).not.toHaveBeenCalled();
    });
    it(`second counselor: ${method} ${path} is indistinguishable from a missing session`, async () => {
      m.getUser.mockResolvedValue({ data: { user: { ...owner, id: "counselor-b" } }, error: null });
      const response = await handler(request(method, path), context);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Session not found" });
      expect(m.from).toHaveBeenCalledTimes(1);
      expect(m.readState).not.toHaveBeenCalled();
      expect(m.downloadPdf).not.toHaveBeenCalled();
      expect(m.downloadImage).not.toHaveBeenCalled();
    });
  }
  it("owner reauthentication reads the same saved work without recreating/deleting it", async () => {
    m.readState.mockResolvedValue({ sessionId, nextStep: "analysis", hasApprovedProfile: true });
    const response = await session.GET(request("GET", "/api/sessions/id"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sessionId, hasApprovedProfile: true });
    expect(m.createSession).not.toHaveBeenCalled();
  });
  it("only the owner receives the redacted image constructed from session/document IDs", async () => {
    m.downloadImage.mockResolvedValue(new Blob(["synthetic-image"]));
    const response = await image.GET(request("GET", "/api/sessions/id/documents/id"), context);
    expect(response.status).toBe(200);
    expect(m.downloadImage).toHaveBeenCalledWith(`${sessionId}/${documentId}.jpg`);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("synthetic-image");
  });
  for (const download of [false, true]) {
    it(`only the owner receives report bytes (${download ? "download" : "preview"})`, async () => {
      m.downloadPdf.mockResolvedValue(new Blob(["%PDF-1.4 synthetic"]));
      const response = await pdf.GET(request("GET", `/api/reports/id${download ? "?download=1" : ""}`), context);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Content-Disposition")).toContain(download ? "attachment" : "inline");
      expect(await response.text()).toContain("%PDF-1.4");
    });
  }
});
describe("S11 maintenance entry points", () => {
  for (const [path, module, work, secretName, header] of [
    ["/api/sessions/expired", cleanup, m.cleanup, "SESSION_CLEANUP_SECRET", "x-session-cleanup-secret"],
    ["/api/reports/retention", retention, m.retention, "REPORT_RETENTION_SECRET", "x-report-retention-secret"],
  ] as const) {
    for (const method of ["GET", "POST"] as const) {
      it(`${method} ${path} rejects a counselor without a service secret`, async () => {
        vi.stubEnv(secretName, "test-only-service-secret");
        const response = await module[method](request(method, path));
        expect(response.status).toBe(401);
        expect(work).not.toHaveBeenCalled();
      });
      it(`${method} ${path} allows its authorized service without a counselor cookie`, async () => {
        vi.stubEnv(secretName, "test-only-service-secret");
        work.mockResolvedValue({ status: "ok" });
        const response = await module[method](new Request(`https://kumpas.example.test${path}`, {
          method, headers: { [header]: "test-only-service-secret" },
        }));
        expect(response.status).toBe(200);
        expect(work).toHaveBeenCalledOnce();
      });
    }
  }
});

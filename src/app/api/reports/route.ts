import { ReportAssemblyError, assembleReportData } from "@/lib/report/assembler";
import { normalizeReportSessionId, pdfFileStore } from "@/lib/report/file-store";
import { renderReportPdf } from "@/lib/report/pdf-renderer";
import type { ReportGenerationResponse } from "@/lib/report/types";
import { runRecommendationProvider } from "@/lib/module3/recommendation-provider";
import { approvedRunProfile, failRun, loadProcessingRun, runBudget, transitionRun, type ProcessingRun } from "@/lib/module5/processing-run";
import { ProcessingError } from "@/lib/processing-budget";
import { supabaseAdmin } from "@/lib/supabase";
import { notFoundResponse, requireUser, unauthorizedResponse, userOwnsSession } from "@/lib/auth/api-auth";

export const runtime = "nodejs";
export const maxDuration = 300;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  let body: { sessionId?: unknown; runId?: unknown };
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  if (!body || typeof body.sessionId !== "string" || !body.sessionId.trim()) return json({ error: "sessionId is required." }, 400);
  let sessionId: string;
  try { sessionId = normalizeReportSessionId(body.sessionId); } catch { return json({ error: "Invalid session id." }, 400); }
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();

  let run: ProcessingRun | undefined;
  let claimed = false;
  let reportVersion: number | undefined;
  let stage = "draft PDF";
  try {
    const current = await loadProcessingRun(sessionId, user.id);
    run = current.run;
    if (body.runId !== run.run_id || !run.recommendations) throw new ProcessingError(stage, "stale");
    const loadReport = async (version: number) => {
      const { data, error } = await supabaseAdmin.from("report_versions").select("generated_at, expires_at, status")
        .eq("session_id", sessionId).eq("counselor_id", user.id)
        .eq("run_id", current.run.run_id).eq("approved_profile_version", current.run.approved_profile_version)
        .eq("report_version", version).in("status", ["draft", "approved"])
        .gt("expires_at", new Date().toISOString()).single();
      if (error || !data) throw new ProcessingError("draft publication", "stale");
      return data;
    };
    if (run.phase === "ready") await loadReport(current.reportVersion);
    const budget = runBudget(run);
    if (run.phase !== "ready") {
      budget.assert(stage);
      run = await transitionRun(run, "claim_report");
      claimed = true;
      if (!run.candidate_report_version) throw new ProcessingError("PDF reservation", "stale");
      reportVersion = run.candidate_report_version;
    }
    const assemble = async (signal?: AbortSignal) => {
      const profile = await approvedRunProfile(run!, signal);
      return assembleReportData(sessionId, { provider: runRecommendationProvider(profile, run!.recommendations!) });
    };
    const reportPayload = claimed ? await budget.run("report assembly", assemble, false) : await assemble();
    const version = reportVersion ?? current.reportVersion;
    let byteLength: number;
    if (claimed) {
      stage = "PDF generation and storage";
      const stored = await budget.run(stage, async (signal) => {
        const buffer = await renderReportPdf(reportPayload);
        budget.assert(stage);
        return pdfFileStore.uploadReportPdf(sessionId, buffer, version, signal);
      });
      byteLength = stored.byteLength;
      budget.assert(stage);
      await transitionRun(run, "report_ready");
    } else {
      // An already-ready draft is read back, never regenerated with a new clock.
      byteLength = (await pdfFileStore.downloadReportPdf(sessionId, current.reportVersion)).size;
    }
    const report = await loadReport(version);
    const response: ReportGenerationResponse = {
      sessionId, reportVersion: version,
      downloadUrl: report.status === "approved"
        ? `/api/reports/${encodeURIComponent(sessionId)}?version=${version}&download=1` : null,
      expiresAt: report.expires_at, generatedAt: report.generated_at, byteLength,
      recommendationCount: reportPayload.rankedRecommendations.recommendations.length,
      academicEvidence: reportPayload.academicEvidence,
      agentStatuses: reportPayload.rankedRecommendations.agentStatuses,
      recommendations: reportPayload.rankedRecommendations.recommendations.map(({ id, rank, careerPath, alignmentScore, incompleteReason, reasoningSummary, keySignals, keySignalDetails }) =>
        ({ id, rank, careerPath, alignmentScore, incompleteReason, reasoningSummary, keySignals, keySignalDetails })),
    };
    return json(response);
  } catch (error) {
    if (run && claimed) {
      await failRun(run, error instanceof ProcessingError ? error.stage : stage);
      if (reportVersion !== undefined) {
        // A publication response can be lost. Never delete an object registered by
        // that RPC or by a newer run; uncertain cleanup remains for retention.
        const { data, error: readError } = await supabaseAdmin.from("report_versions").select("report_version")
          .eq("session_id", sessionId).eq("report_version", reportVersion).maybeSingle();
        if (!readError && !data) await pdfFileStore.deleteReportPdf(sessionId, reportVersion).catch(() => undefined);
      }
    }
    return json({ error: error instanceof ProcessingError ? error.message : `${stage} failed. Your approved inputs are saved. Retry analysis or return to Confirm Information.`,
      failedStage: error instanceof ProcessingError ? error.stage : stage, retryRunId: run?.run_id,
      ...(error instanceof ReportAssemblyError ? { details: error.details } : {}),
    }, error instanceof ReportAssemblyError ? 422 : error instanceof ProcessingError ? 409 : 502);
  }
}

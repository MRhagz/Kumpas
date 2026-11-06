import { type NextRequest } from "next/server";
import { InsufficientEvidenceError } from "@/lib/module3/alignment-score-calculator";
import { agentDispatcher } from "@/lib/module3/agent-dispatcher";
import { metaAgentSynthesizer } from "@/lib/module3/meta-agent-synthesizer";
import { approvedRunProfile, failRun, loadProcessingRun, runBudget, transitionRun, type ProcessingRun } from "@/lib/module5/processing-run";
import { ProcessingError } from "@/lib/processing-budget";
import { sessionStateManager } from "@/lib/module5/session-state-manager";
import { supabaseAdmin } from "@/lib/supabase";
import { notFoundResponse, requireUser, unauthorizedResponse, userOwnsSession } from "@/lib/auth/api-auth";

export const maxDuration = 300;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();

  let run: ProcessingRun | undefined;
  let claimed = false;
  let stage = "analysis";
  try {
    const text = await request.text();
    let body: { runId?: string | null; profileVersion?: number; retryRunId?: string | null };
    try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: "Invalid analysis request." }, 400); }
    if (!body || typeof body !== "object" || !Number.isInteger(body.profileVersion) ||
        (typeof body.runId !== "string" && body.runId !== null)) return json({ error: "The approved run and profile version are required." }, 400);
    if (body.retryRunId !== undefined) {
      const saved = await sessionStateManager.getSessionState(sessionId, user.id);
      if (!saved?.hasApprovedProfile || body.retryRunId !== saved.currentRunId ||
          body.runId !== saved.currentRunId || body.profileVersion !== saved.profileVersion) {
        throw new ProcessingError(stage, "stale");
      }
      if (saved.analysisRestartRequired) {
        const { data, error } = await supabaseAdmin.rpc("start_analysis_run", {
          p_session_id: sessionId, p_counselor_id: user.id,
          p_expected_version: saved.profileVersion, p_expected_run_id: saved.currentRunId,
        });
        if (error || !data) throw new ProcessingError(stage, "stale");
        run = data as ProcessingRun;
      } else {
        ({ run } = await loadProcessingRun(sessionId, user.id));
        if (body.retryRunId !== run.run_id) throw new ProcessingError(stage, "stale");
        run = await transitionRun(run, "retry");
      }
    } else {
      ({ run } = await loadProcessingRun(sessionId, user.id));
      if (body.runId !== run.run_id || body.profileVersion !== run.approved_profile_version) {
        throw new ProcessingError(stage, "stale");
      }
    }
    if (run.phase === "report_pending" || run.phase === "ready") {
      return json({ rankedRecommendations: run.recommendations, runId: run.run_id, profileVersion: run.approved_profile_version });
    }
    const budget = runBudget(run);
    budget.assert(stage);
    run = await transitionRun(run, "claim_analysis");
    claimed = true;
    const approvedProfile = await budget.run("approved profile", (signal) => approvedRunProfile(run!, signal), false);
    stage = "specialist analysis";
    const agentOutputs = await agentDispatcher.dispatch({ sessionId, approvedProfile }, budget);
    if (agentOutputs.every((output) => output.status === "FAILED")) {
      throw new Error("Specialist analysis unavailable. Check provider or Supabase availability and retry analysis. Approved inputs are saved.");
    }
    stage = "synthesis and explanation";
    const rankedRecommendations = await metaAgentSynthesizer.synthesize(sessionId, agentOutputs, approvedProfile, run.approved_profile_version, budget, false);
    budget.assert(stage);
    await transitionRun(run, "analysis_ready", rankedRecommendations);
    return json({ rankedRecommendations, runId: run.run_id, profileVersion: run.approved_profile_version, agentStatuses: agentOutputs.map(({ agentName, status, error }) => ({ agent: agentName, status, error })) });
  } catch (error) {
    if (run && claimed) await failRun(run, error instanceof ProcessingError ? error.stage : stage);
    return json({
      error: error instanceof ProcessingError || error instanceof InsufficientEvidenceError ? error.message : `${stage} failed. Your approved inputs are saved. Check Gemini configuration/quota and Supabase availability, then Retry analysis or return to Confirm Information.`,
      failedStage: error instanceof ProcessingError ? error.stage : stage,
      retryRunId: run?.run_id,
    }, error instanceof InsufficientEvidenceError ? 422 : error instanceof ProcessingError ? 409 : 502);
  }
}

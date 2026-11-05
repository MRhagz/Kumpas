import { type NextRequest } from "next/server";
import { agentDispatcher } from "@/lib/module3/agent-dispatcher";
import { metaAgentSynthesizer } from "@/lib/module3/meta-agent-synthesizer";
import { approvedRunProfile, failRun, loadProcessingRun, runBudget, transitionRun, type ProcessingRun } from "@/lib/module5/processing-run";
import { ProcessingError } from "@/lib/processing-budget";
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
    let body: { retryRunId?: string };
    try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: "Invalid analysis request." }, 400); }
    if (!body || typeof body !== "object") return json({ error: "Invalid analysis request." }, 400);
    ({ run } = await loadProcessingRun(sessionId, user.id));
    if (body.retryRunId !== undefined) {
      if (body.retryRunId !== run.run_id) throw new ProcessingError(stage, "stale");
      run = await transitionRun(run, "retry");
    }
    if (run.phase === "report_pending" || run.phase === "ready") {
      return json({ rankedRecommendations: run.recommendations, runId: run.run_id });
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
    const rankedRecommendations = await metaAgentSynthesizer.synthesize(sessionId, agentOutputs, budget, false);
    budget.assert(stage);
    await transitionRun(run, "analysis_ready", rankedRecommendations);
    return json({ rankedRecommendations, runId: run.run_id, agentStatuses: agentOutputs.map(({ agentName, status, error }) => ({ agent: agentName, status, error })) });
  } catch (error) {
    if (run && claimed) await failRun(run, error instanceof ProcessingError ? error.stage : stage);
    return json({
      error: error instanceof ProcessingError ? error.message : `${stage} failed. Your approved inputs are saved. Check Gemini configuration/quota and Supabase availability, then Retry analysis or return to Confirm Information.`,
      failedStage: error instanceof ProcessingError ? error.stage : stage,
      retryRunId: run?.run_id,
    }, error instanceof ProcessingError ? 409 : 502);
  }
}

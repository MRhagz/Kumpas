import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { agentDispatcher } from "@/lib/module3/agent-dispatcher";
import { metaAgentSynthesizer } from "@/lib/module3/meta-agent-synthesizer";
import { sessionProgressTracker } from "@/lib/module5/session-progress";
import {
  notFoundResponse,
  requireUser,
  unauthorizedResponse,
  userOwnsSession,
} from "@/lib/auth/api-auth";
import type { ApprovedProfile } from "@/types";

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");

  return Response.json(data, {
    ...init,
    headers,
  });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();

  try {
    const { data: session, error: fetchErr } = await supabaseAdmin
      .from("sessions")
      .select("approved_profile, status")
      .eq("id", sessionId)
      .single();

    if (fetchErr || !session) {
      return notFoundResponse();
    }

    if (!session.approved_profile) {
      return json(
        { error: "No approved profile found. Complete Module 2 first." },
        { status: 400 },
      );
    }

    await sessionProgressTracker.markAnalysisInProgress(sessionId);

    const approvedProfile = session.approved_profile as ApprovedProfile;

    const agentOutputs = await agentDispatcher.dispatch({
      sessionId,
      approvedProfile,
    });

    const allFailed = agentOutputs.every((o) => o.status === "FAILED");
    if (allFailed) {
      await sessionProgressTracker.markAnalysisFailed(sessionId);

      return json(
        { error: "All specialist agents failed. Please try again." },
        { status: 502 },
      );
    }

    const rankedRecommendations = await metaAgentSynthesizer.synthesize(
      sessionId,
      agentOutputs,
    );

    await sessionProgressTracker.markAnalysisComplete(sessionId);

    return json({
      rankedRecommendations,
      agentStatuses: agentOutputs.map((o) => ({
        agent: o.agentName,
        status: o.status,
        error: o.error,
      })),
    });
  } catch (err) {
    await sessionProgressTracker.markAnalysisFailed(sessionId);

    console.error(`[analyze route] sessionId=${sessionId}`, err);
    return json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}

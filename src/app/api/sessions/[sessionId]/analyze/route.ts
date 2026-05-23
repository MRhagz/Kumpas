import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { agentDispatcher } from "@/lib/module3/agent-dispatcher";
import { metaAgentSynthesizer } from "@/lib/module3/meta-agent-synthesizer";
import type { ApprovedProfile } from "@/types";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  try {
    const { data: session, error: fetchErr } = await supabaseAdmin
      .from("sessions")
      .select("approved_profile, status")
      .eq("id", sessionId)
      .single();

    if (fetchErr || !session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    if (!session.approved_profile) {
      return Response.json(
        { error: "No approved profile found. Complete Module 2 first." },
        { status: 400 },
      );
    }

    const approvedProfile = session.approved_profile as ApprovedProfile;

    const agentOutputs = await agentDispatcher.dispatch({
      sessionId,
      approvedProfile,
    });

    const allFailed = agentOutputs.every((o) => o.status === "FAILED");
    if (allFailed) {
      return Response.json(
        { error: "All specialist agents failed. Please try again." },
        { status: 502 },
      );
    }

    const rankedRecommendations = await metaAgentSynthesizer.synthesize(
      sessionId,
      agentOutputs,
    );

    await supabaseAdmin
      .from("sessions")
      .update({ last_activity: new Date().toISOString() })
      .eq("id", sessionId);

    return Response.json({
      rankedRecommendations,
      agentStatuses: agentOutputs.map((o) => ({
        agent: o.agentName,
        status: o.status,
        error: o.error,
      })),
    });
  } catch (err) {
    console.error(`[analyze route] sessionId=${sessionId}`, err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}

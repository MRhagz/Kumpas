import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { agentDispatcher } from "@/lib/module3/agent-dispatcher";
import { metaAgentSynthesizer } from "@/lib/module3/meta-agent-synthesizer";
import type { ApprovedProfile } from "@/types";

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");

  return Response.json(data, {
    ...init,
    headers,
  });
}

function getBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  try {
    const token = getBearerToken(request);
    if (!token) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(token);

    if (authErr || !user) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: session, error: fetchErr } = await supabaseAdmin
      .from("sessions")
      .select("approved_profile, status, counselor_id")
      .eq("id", sessionId)
      .single();

    if (fetchErr || !session) {
      return json({ error: "Session not found" }, { status: 404 });
    }

    if (session.counselor_id !== user.id) {
      return json({ error: "Session not found" }, { status: 404 });
    }

    if (!session.approved_profile) {
      return json(
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
      return json(
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

    return json({
      rankedRecommendations,
      agentStatuses: agentOutputs.map((o) => ({
        agent: o.agentName,
        status: o.status,
        error: o.error,
      })),
    });
  } catch (err) {
    console.error(`[analyze route] sessionId=${sessionId}`, err);
    return json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}

import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
import type { Session } from "@/types";

export type SessionNextStep =
  | "input"
  | "analysis"
  | "report"
  | "complete"
  | "start-new-session";

export interface SessionState {
  sessionId: string;
  status: Session["status"] | "complete";
  expiresAt: string;
  lastActivity: string;
  hasApprovedProfile: boolean;
  hasRecommendations: boolean;
  hasReport: boolean;
  nextStep: SessionNextStep;
}

interface SessionStateRow {
  id: string;
  status: SessionState["status"];
  approved_profile: unknown | null;
  expires_at: string;
  last_activity: string;
}

export class SessionStateManager {
  async getSessionState(sessionId: string): Promise<SessionState | null> {
    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .select("id, status, approved_profile, expires_at, last_activity")
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load session state: ${error.message}`);
    }

    if (!session) {
      return null;
    }

    const sessionRow = session as SessionStateRow;
    const hasApprovedProfile = sessionRow.approved_profile !== null;
    const hasRecommendations = await this.hasRankedRecommendations(sessionId);
    const hasReport =
      sessionRow.status === "completed" || sessionRow.status === "complete";

    return {
      sessionId: sessionRow.id,
      status: sessionRow.status,
      expiresAt: sessionRow.expires_at,
      lastActivity: sessionRow.last_activity,
      hasApprovedProfile,
      hasRecommendations,
      hasReport,
      nextStep: getNextStep({
        status: sessionRow.status,
        hasApprovedProfile,
        hasRecommendations,
        hasReport,
      }),
    };
  }

  private async hasRankedRecommendations(sessionId: string): Promise<boolean> {
    const { count, error } = await supabaseAdmin
      .from("ranked_recommendations")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if (error) {
      throw new Error(`Failed to load recommendation state: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }
}

function getNextStep(input: {
  status: SessionState["status"];
  hasApprovedProfile: boolean;
  hasRecommendations: boolean;
  hasReport: boolean;
}): SessionNextStep {
  if (input.status === "expired" || input.status === "cancelled") {
    return "start-new-session";
  }

  if (input.hasReport) {
    return "complete";
  }

  if (input.hasRecommendations) {
    return "report";
  }

  if (input.hasApprovedProfile) {
    return "analysis";
  }

  return "input";
}

export const sessionStateManager = new SessionStateManager();

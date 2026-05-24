import "server-only";

import {
  normalizeModuleStatus,
  type ModuleStatus,
  type ReportStatus,
} from "@/lib/module5/session-progress";
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
  status: Session["status"];
  expiresAt: string;
  lastActivity: string;
  completedAt: string | null;
  moduleStatus: ModuleStatus;
  reportStatus: ReportStatus;
  hasApprovedProfile: boolean;
  hasRecommendations: boolean;
  hasReport: boolean;
  nextStep: SessionNextStep;
}

interface SessionStateRow {
  id: string;
  status: Session["status"];
  approved_profile: unknown | null;
  module_status: unknown;
  report_status: ReportStatus;
  expires_at: string;
  last_activity: string;
  completed_at: string | null;
}

export class SessionStateManager {
  async getSessionState(sessionId: string): Promise<SessionState | null> {
    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .select(
        "id, status, approved_profile, module_status, report_status, expires_at, last_activity, completed_at",
      )
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load session state: ${error.message}`);
    }

    if (!session) {
      return null;
    }

    const sessionRow = session as SessionStateRow;
    const moduleStatus = normalizeModuleStatus(sessionRow.module_status);
    const hasApprovedProfile = sessionRow.approved_profile !== null;
    const hasRecommendations = await this.hasRankedRecommendations(sessionId);
    const hasReport =
      sessionRow.report_status === "ready" ||
      sessionRow.report_status === "downloaded";

    return {
      sessionId: sessionRow.id,
      status: sessionRow.status,
      expiresAt: sessionRow.expires_at,
      lastActivity: sessionRow.last_activity,
      completedAt: sessionRow.completed_at,
      moduleStatus,
      reportStatus: sessionRow.report_status,
      hasApprovedProfile,
      hasRecommendations,
      hasReport,
      nextStep: getNextStep({
        status: sessionRow.status,
        reportStatus: sessionRow.report_status,
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
  reportStatus: ReportStatus;
  hasApprovedProfile: boolean;
  hasRecommendations: boolean;
  hasReport: boolean;
}): SessionNextStep {
  if (input.status === "expired" || input.status === "cancelled") {
    return "start-new-session";
  }

  if (input.hasReport) {
    return input.reportStatus === "downloaded" ? "complete" : "report";
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

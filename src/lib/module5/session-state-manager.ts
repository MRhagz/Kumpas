import "server-only";

import type { ModuleStatus, ReportStatus } from "@/lib/module5/session-progress";
import { supabaseAdmin } from "@/lib/supabase";
import type { Session } from "@/types";

export type SessionNextStep = "input" | "analysis" | "report" | "complete" | "start-new-session";

export interface SessionState {
  sessionId: string;
  currentRunId: string | null;
  profileVersion: number;
  analysisRetryRequired: boolean;
  analysisRestartRequired: boolean;
  processingInProgress: boolean;
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

const STATE_COLUMNS =
  "id, status, current_profile_version, current_run_id, current_report_version, report_status, expires_at, last_activity, completed_at";

export async function listOwnerDrafts(counselorId: string) {
  const { data, error } = await supabaseAdmin.from("sessions")
    .select("id, created_at, expires_at, current_profile_version, profile_versions(profile_version, approved_at)")
    .eq("counselor_id", counselorId).eq("status", "active")
    .eq("profile_versions.counselor_id", counselorId)
    .gt("current_profile_version", 0).gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error("Saved drafts could not be loaded.");
  return (data ?? []).filter((draft) => Date.parse(draft.expires_at) > Date.now() &&
    draft.profile_versions.some((profile) =>
      profile.profile_version === draft.current_profile_version && profile.approved_at !== null))
    .map(({ id, created_at, expires_at }) => ({ id, created_at, expires_at }));
}

export class SessionStateManager {
  async getSessionState(sessionId: string, counselorId: string): Promise<SessionState | null> {
    const readSession = () => supabaseAdmin.from("sessions").select(STATE_COLUMNS)
      .eq("id", sessionId).eq("counselor_id", counselorId)
      .in("status", ["active", "completed"]).gt("expires_at", new Date().toISOString()).maybeSingle();
    const { data: session, error } = await readSession();
    if (error) throw new Error("Saved session could not be loaded.");
    if (!session || !(Date.parse(session.expires_at) > Date.now())) return null;

    const version = session.current_profile_version;
    const runId = session.current_run_id;
    const [profile, run, report] = await Promise.all([
      version > 0 ? supabaseAdmin.from("profile_versions").select("profile_version")
        .eq("session_id", sessionId).eq("counselor_id", counselorId)
        .eq("profile_version", version).not("approved_at", "is", null).maybeSingle() : { data: null },
      runId ? supabaseAdmin.from("analysis_runs").select("phase, status, deadline_at, recommendations")
        .eq("session_id", sessionId).eq("counselor_id", counselorId)
        .eq("run_id", runId).eq("approved_profile_version", version).maybeSingle() : { data: null },
      runId && session.current_report_version > 0
        ? supabaseAdmin.from("report_versions").select("status, expires_at")
          .eq("session_id", sessionId).eq("counselor_id", counselorId)
          .eq("run_id", runId).eq("approved_profile_version", version)
          .eq("report_version", session.current_report_version)
          .in("status", ["draft", "approved"]).maybeSingle() : { data: null },
    ]);
    if ([profile, run, report].some((result) => "error" in result && result.error)) {
      throw new Error("Saved session versions could not be loaded.");
    }

    // Recheck the pointers in case a concurrent approval, retry or cancellation superseded these reads.
    const latest = await readSession();
    if (latest.error) throw new Error("Saved session could not be rechecked.");
    if (!latest.data || latest.data.current_profile_version !== version ||
        latest.data.current_run_id !== runId ||
        latest.data.current_report_version !== session.current_report_version ||
        latest.data.status !== session.status ||
        !(Date.parse(latest.data.expires_at) > Date.now())) return null;

    const hasApprovedProfile = !!profile.data;
    const currentRun = hasApprovedProfile && run.data?.status !== "superseded" ? run.data : null;
    const hasReport = currentRun?.phase === "ready" && currentRun.status === "completed" &&
      !!currentRun.recommendations && !!report.data && Date.parse(report.data.expires_at) > Date.now();
    const analysisRestartRequired = hasApprovedProfile &&
      (!currentRun || (currentRun.phase === "ready" && !hasReport));
    const analysisRetryRequired = analysisRestartRequired || (!!currentRun && !hasReport &&
      (currentRun.phase === "failed" || Date.parse(currentRun.deadline_at) <= Date.now()));
    const hasRecommendations = !!currentRun?.recommendations &&
      (hasReport || (!analysisRetryRequired && currentRun.status === "running" &&
        currentRun.phase === "report_pending"));
    const reportStatus: ReportStatus = hasReport
      ? latest.data.status === "completed" && latest.data.report_status === "downloaded" ? "downloaded" : "ready"
      : "not_started";
    const moduleStatus: ModuleStatus = {
      intake: hasApprovedProfile ? "complete" : "not_started",
      profile: hasApprovedProfile ? "complete" : "not_started",
      analysis: hasRecommendations ? "complete" : analysisRetryRequired ? "failed" : "not_started",
      report: hasReport ? "complete" : "not_started",
    };

    let nextStep: SessionNextStep = "input";
    if (reportStatus === "downloaded") nextStep = "complete";
    else if (latest.data.status === "completed" && !hasReport) nextStep = "start-new-session";
    else if (hasRecommendations) nextStep = "report";
    else if (hasApprovedProfile) nextStep = "analysis";

    return {
      sessionId,
      currentRunId: runId,
      profileVersion: version,
      analysisRetryRequired,
      analysisRestartRequired,
      processingInProgress: !analysisRetryRequired &&
        (currentRun?.phase === "analysis" || currentRun?.phase === "report"),
      status: latest.data.status,
      expiresAt: latest.data.expires_at,
      lastActivity: latest.data.last_activity,
      completedAt: latest.data.completed_at,
      moduleStatus,
      reportStatus,
      hasApprovedProfile,
      hasRecommendations,
      hasReport,
      nextStep,
    };
  }
}

export const sessionStateManager = new SessionStateManager();

export type { SessionVersionContract } from "@/lib/module5/versioned-contracts";

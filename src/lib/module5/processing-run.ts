import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { ProcessingBudget, ProcessingError } from "@/lib/processing-budget";
import type { ApprovedProfile } from "@/types";
import type { RankedRecommendationList } from "@/lib/report/types";

export interface ProcessingRun {
  session_id: string;
  counselor_id: string;
  run_id: string;
  approved_profile_version: number;
  analysis_started_at: string;
  deadline_at: string;
  status: "running" | "completed" | "superseded";
  phase: "pending" | "analysis" | "report_pending" | "report" | "ready" | "failed";
  failed_stage: string | null;
  recommendations: RankedRecommendationList | null;
  candidate_report_version: number | null;
}

export async function loadProcessingRun(sessionId: string, counselorId: string) {
  const readSession = () => supabaseAdmin.from("sessions")
    .select("current_run_id, current_profile_version, current_report_version, expires_at, status")
    .eq("id", sessionId).eq("counselor_id", counselorId);
  const { data: session, error } = await readSession().single();
  if (error || !session || !session.current_run_id || !["active", "completed"].includes(session.status) || Date.parse(session.expires_at) <= Date.now()) {
    throw new ProcessingError("approved analysis", "stale");
  }
  const { data, error: runError } = await supabaseAdmin.from("analysis_runs").select("*")
    .eq("run_id", session.current_run_id).eq("session_id", sessionId).eq("counselor_id", counselorId).single();
  if (runError || !data || data.approved_profile_version !== session.current_profile_version) throw new ProcessingError("analysis run", "stale");
  const run = data as ProcessingRun;
  // Publication can commit between the session and run reads. Recheck only
  // the same owner, profile, run and published version before resuming it.
  if (run.phase === "ready" && run.candidate_report_version !== null &&
      run.candidate_report_version !== session.current_report_version) {
    const { data: published, error: publicationError } = await readSession()
      .eq("current_run_id", run.run_id).eq("current_profile_version", run.approved_profile_version)
      .eq("current_report_version", run.candidate_report_version)
      .in("status", ["active", "completed"]).gt("expires_at", new Date().toISOString()).single();
    if (publicationError || !published) throw new ProcessingError("draft publication", "stale");
    return { run, reportVersion: published.current_report_version as number };
  }
  return { run, reportVersion: session.current_report_version as number };
}

export async function transitionRun(run: ProcessingRun, action: string, result?: RankedRecommendationList, stage?: string): Promise<ProcessingRun> {
  const { data, error } = await supabaseAdmin.rpc("transition_processing_run", {
    p_session_id: run.session_id, p_counselor_id: run.counselor_id, p_run_id: run.run_id,
    p_expected_version: run.approved_profile_version, p_action: action,
    p_result: result ?? null, p_stage: stage ?? null,
  });
  if (error || !data) throw new ProcessingError(stage ?? action, "stale");
  return data as ProcessingRun;
}

export async function approvedRunProfile(run: ProcessingRun, signal?: AbortSignal): Promise<ApprovedProfile> {
  const request = supabaseAdmin.from("profile_versions").select("profile")
    .eq("session_id", run.session_id).eq("profile_version", run.approved_profile_version)
    .eq("counselor_id", run.counselor_id).not("approved_at", "is", null);
  const { data, error } = await (signal ? request.abortSignal(signal) : request).single();
  if (error || !data) throw new ProcessingError("approved profile", "stale");
  return data.profile as ApprovedProfile;
}

export function runBudget(run: ProcessingRun): ProcessingBudget {
  return new ProcessingBudget(Date.parse(run.deadline_at), run.run_id);
}

export async function failRun(run: ProcessingRun, stage: string): Promise<void> {
  // A stale/cancelled run must never overwrite the newer run's progress.
  await transitionRun(run, "fail", undefined, stage).catch(() => undefined);
}

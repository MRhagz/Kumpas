import type { ApprovedProfile } from "@/types";

/** UTC ISO-8601 timestamps returned by the server; never activity-based. */
export type UtcTimestamp = string;
export type ReportApprovalState = "draft" | "approved" | "rejected" | "out_of_date";

export interface SessionVersionContract {
  sessionId: string;
  counselorId: string;
  createdAt: UtcTimestamp;
  expiresAt: UtcTimestamp;
  currentProfileVersion: number; // 0 means no version-bound approval (including legacy rows).
  currentRunId: string | null;
  currentReportVersion: number;
}

export interface ProfileVersionContract {
  sessionId: string;
  counselorId: string;
  profileVersion: number;
  profile: Readonly<ApprovedProfile>;
  createdAt: UtcTimestamp;
  approvedAt: UtcTimestamp | null;
}

export interface AnalysisRunContract {
  sessionId: string;
  counselorId: string;
  approvedProfileVersion: number;
  runId: string;
  analysisStartedAt: UtcTimestamp;
  deadlineAt: UtcTimestamp;
  status: "running" | "completed" | "superseded";
}

export interface ReportVersionContract {
  sessionId: string;
  counselorId: string;
  approvedProfileVersion: number;
  runId: string;
  reportVersion: number;
  objectKey: string;
  generatedAt: UtcTimestamp;
  expiresAt: UtcTimestamp;
  status: ReportApprovalState;
  approvedAt: UtcTimestamp | null;
}

export const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const PDF_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const ANALYSIS_BUDGET_MS = 300 * 1000;

/** Access ends exactly at the boundary. Invalid timestamps fail closed. */
export function isBeforeExpiry(expiresAt: UtcTimestamp, now: number): boolean {
  return Number.isFinite(now) && now < Date.parse(expiresAt);
}

/** Display/helper check only. Writes must use the atomic database RPCs. */
export function isCurrentRun(session: SessionVersionContract, run: AnalysisRunContract, now: number): boolean {
  return session.sessionId === run.sessionId && session.counselorId === run.counselorId &&
    session.currentProfileVersion === run.approvedProfileVersion && session.currentRunId === run.runId &&
    run.status === "running" && isBeforeExpiry(session.expiresAt, now) && isBeforeExpiry(run.deadlineAt, now);
}

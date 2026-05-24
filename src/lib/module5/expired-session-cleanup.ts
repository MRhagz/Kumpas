import "server-only";

import { sessionTerminationHandler } from "@/lib/report/session-termination";
import { supabaseAdmin } from "@/lib/supabase";

export interface ExpiredSessionCleanupOptions {
  inactivityHours?: number;
  limit?: number;
  now?: Date;
}

export interface ExpiredSessionCleanupResult {
  cutoff: string;
  scannedCount: number;
  expiredCount: number;
  warningCount: number;
  warnings: string[];
}

interface ExpiredSessionRow {
  id: string;
}

const DEFAULT_INACTIVITY_HOURS = 24;
const DEFAULT_LIMIT = 50;

export async function runExpiredSessionCleanup(
  options: ExpiredSessionCleanupOptions = {},
): Promise<ExpiredSessionCleanupResult> {
  const inactivityHours = options.inactivityHours ?? DEFAULT_INACTIVITY_HOURS;
  const limit = options.limit ?? DEFAULT_LIMIT;

  if (!Number.isFinite(inactivityHours) || inactivityHours <= 0) {
    throw new Error("inactivityHours must be greater than zero.");
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }

  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - inactivityHours * 60 * 60 * 1000);
  const sessions = await getExpiredSessions(cutoff, now, limit);
  const warnings: string[] = [];
  let expiredCount = 0;

  for (const session of sessions) {
    const result = await sessionTerminationHandler.terminateSession(session.id, {
      terminalStatus: "expired",
      warn: () => undefined,
    });

    warnings.push(...result.warnings);

    if (result.sessionScrubbed) {
      expiredCount += 1;
    }
  }

  return {
    cutoff: cutoff.toISOString(),
    scannedCount: sessions.length,
    expiredCount,
    warningCount: warnings.length,
    warnings,
  };
}

async function getExpiredSessions(
  inactivityCutoff: Date,
  now: Date,
  limit: number,
): Promise<ExpiredSessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("id")
    .eq("status", "active")
    .or(
      `expires_at.lte.${now.toISOString()},last_activity.lte.${inactivityCutoff.toISOString()}`,
    )
    .order("last_activity", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load expired sessions: ${error.message}`);
  }

  return (data ?? []) as ExpiredSessionRow[];
}

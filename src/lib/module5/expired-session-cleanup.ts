import "server-only";

import { sessionTerminationHandler } from "@/lib/report/session-termination";
import { supabaseAdmin } from "@/lib/supabase";

export interface ExpiredSessionCleanupOptions {
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

const DEFAULT_LIMIT = 50;

export async function runExpiredSessionCleanup(
  options: ExpiredSessionCleanupOptions = {},
): Promise<ExpiredSessionCleanupResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }

  const now = options.now ?? new Date();
  const sessions = await getExpiredSessions(now, limit);
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
    cutoff: now.toISOString(),
    scannedCount: sessions.length,
    expiredCount,
    warningCount: warnings.length,
    warnings,
  };
}

async function getExpiredSessions(
  now: Date,
  limit: number,
): Promise<ExpiredSessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("id")
    .eq("status", "active")
    .lte("expires_at", now.toISOString())
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load expired sessions: ${error.message}`);
  }

  return (data ?? []) as ExpiredSessionRow[];
}

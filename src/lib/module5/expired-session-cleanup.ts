import "server-only";
import { operationalEvent } from "@/lib/operational-log";

import { drainExtractionCleanup } from "@/lib/module2/extraction-cleanup";

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
  status: string;
}

const DEFAULT_LIMIT = 50;

export async function runExpiredSessionCleanup(
  options: ExpiredSessionCleanupOptions = {},
): Promise<ExpiredSessionCleanupResult> {
  const startedAt = Date.now();
  const limit = options.limit ?? DEFAULT_LIMIT;

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }

  const now = options.now ?? new Date();
  const sessions = await getExpiredSessions(now, limit);
  const warnings: string[] = [];
  let expiredCount = 0;

  for (const session of sessions) {
    try {
      const result = await sessionTerminationHandler.terminateSession(session.id, {
        terminalStatus: session.status === "cancelled" ? "cancelled" : "expired",
        warn: () => undefined,
      });
      warnings.push(...result.warnings);
      if (result.sessionRowsPurged) expiredCount += 1;
    } catch {
      warnings.push("Session content cleanup is pending retry.");
    }
  }

  // Includes cancelled/expired sessions and orphaned legacy artifacts.
  try {
    const inventory = await supabaseAdmin.rpc("queue_legacy_document_cleanup");
    if (inventory.error) throw new Error("Artifact inventory unavailable.");
    const cleanup = await drainExtractionCleanup(null, Math.min(limit, 100));
    if (cleanup.pending) warnings.push("Temporary artifact cleanup is pending retry.");
  } catch { warnings.push("Temporary artifact cleanup is pending retry."); }

  operationalEvent("session_cleanup", warnings.length ? "retry" : "success", startedAt, { pending: warnings.length, ...(warnings.length ? { code: "cleanup_pending" as const } : {}) });
  console.info("[session-retention] cleanup completed", { scannedCount: sessions.length, expiredCount, warningCount: warnings.length });

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
    .select("id,status")
    .is("draft_purged_at", null)
    .in("status", ["active", "completed", "expired", "cancelled"])
    .or(`expires_at.lte.${now.toISOString()},status.eq.cancelled`)
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error("Failed to load expired sessions.");
  }

  return (data ?? []) as ExpiredSessionRow[];
}

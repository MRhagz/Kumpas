import "server-only";
import { operationalEvent } from "@/lib/operational-log";

import {
  pdfFileStore,
  type ReportPdfRetentionResult,
} from "@/lib/report/file-store";
import { drainReportCleanup, queueReportCleanup } from "@/lib/report/artifact-cleanup";
import { supabaseAdmin } from "@/lib/supabase";

export interface ReportRetentionCleanupOptions {
  retentionHours?: number;
  log?: Pick<Console, "info" | "warn">;
}

export interface ReportRetentionCleanupResult
  extends ReportPdfRetentionResult {
  retentionHours: number;
  status: "ok" | "completed_with_warnings";
}

export async function runReportRetentionCleanup(
  options: ReportRetentionCleanupOptions = {},
): Promise<ReportRetentionCleanupResult> {
  const startedAt = Date.now();
  const retentionHours = 24;
  if (options.retentionHours !== undefined && options.retentionHours !== retentionHours) {
    throw new Error("PDF retention is fixed at 24 hours.");
  }
  const log = options.log ?? console;
  const prepared = await supabaseAdmin.rpc("prepare_report_retention");
  if (prepared.error) throw new Error("Could not prepare report retention.");
  const result = await pdfFileStore.purgeExpiredReportPdfs(async (objectKey) => {
    const { data, error } = await supabaseAdmin.from("report_versions")
      .select("expires_at").eq("object_key", objectKey).maybeSingle();
    if (error) throw new Error("Could not verify the PDF expiry.");
    if (data) return data.expires_at;
    const sessionId = objectKey.split("/")[0];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) return null;
    const tombstone = await supabaseAdmin.from("retention_tombstones")
      .select("session_id").eq("session_id", sessionId).maybeSingle();
    if (tombstone.error) throw new Error("Could not verify report deletion state.");
    return tombstone.data ? new Date(0).toISOString() : null;
  }, queueReportCleanup);
  const cleanup = await drainReportCleanup();
  result.deletedCount += cleanup.removed;
  if (cleanup.pending) result.warnings.push("Report artifact cleanup is pending retry.");
  operationalEvent("report_cleanup", cleanup.pending ? "retry" : "success", startedAt,
    { pending: Number(cleanup.pending), log, ...(cleanup.pending ? { code: "cleanup_pending" as const } : {}) });
  const status =
    result.warnings.length > 0 ? "completed_with_warnings" : "ok";

  log.info("[report-retention] cleanup completed", {
    retentionHours,
    cutoff: result.cutoff,
    scannedCount: result.scannedCount,
    deletedCount: result.deletedCount,
    warningCount: result.warnings.length,
    status,
  });

  if (result.warnings.length > 0) {
    log.warn("[report-retention] cleanup completed with warnings", {
      warningCount: result.warnings.length,
      status,
    });
  }

  return {
    ...result,
    retentionHours,
    status,
  };
}

import "server-only";

import {
  pdfFileStore,
  type ReportPdfRetentionResult,
} from "@/lib/report/file-store";
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
  const retentionHours = 24;
  if (options.retentionHours !== undefined && options.retentionHours !== retentionHours) {
    throw new Error("PDF retention is fixed at 24 hours.");
  }
  const log = options.log ?? console;
  const result = await pdfFileStore.purgeExpiredReportPdfs(async (objectKey) => {
    const { data, error } = await supabaseAdmin.from("report_versions")
      .select("expires_at").eq("object_key", objectKey).maybeSingle();
    if (error) throw new Error("Could not verify the PDF expiry.");
    return data?.expires_at ?? null;
  });
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

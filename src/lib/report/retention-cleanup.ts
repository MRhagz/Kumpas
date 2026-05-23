import "server-only";

import {
  pdfFileStore,
  type ReportPdfRetentionResult,
} from "@/lib/report/file-store";

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
  const retentionHours = options.retentionHours ?? 24;
  const log = options.log ?? console;
  const result = await pdfFileStore.purgeExpiredReportPdfs(retentionHours);
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

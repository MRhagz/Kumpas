import "server-only";

import { drainExtractionCleanup } from "@/lib/module2/extraction-cleanup";
import { drainReportCleanup, queueReportCleanup } from "@/lib/report/artifact-cleanup";
import { pdfFileStore } from "@/lib/report/file-store";
import { supabaseAdmin } from "@/lib/supabase";

export interface SessionTerminationResult {
  sessionId: string;
  reportPdfPurged: boolean;
  redactedImagesPurged: number;
  sessionRowsPurged: boolean;
  sessionScrubbed: boolean;
  cleanupPending: boolean;
  warnings: string[];
}

export interface SessionTerminationOptions {
  terminalStatus?: "cancelled" | "expired";
  warn?: (message: string) => void;
}

export class SessionTerminationHandler {
  constructor(
    private readonly warn: (message: string) => void = (message) =>
      console.warn(message),
  ) {}

  async terminateSession(
    sessionId: string,
    options: SessionTerminationOptions = {},
  ): Promise<SessionTerminationResult> {
    const warnings: string[] = [];
    const terminalStatus = options.terminalStatus ?? "cancelled";
    const warn = options.warn ?? this.warn;
    let reportPdfPurged = terminalStatus === "cancelled";
    let sessionRowsPurged = true;
    const sessionScrubbed = true;
    let redactedImagesPurged = 0;
    let reportInventoryCompleted = true;
    let cleanupPending = false;

    // Revoke first so a late provider/PDF result cannot publish during cleanup.
    await this.scrubSession(sessionId, terminalStatus);

    if (terminalStatus === "cancelled") {
      try {
        await pdfFileStore.queueSessionReportPdfs(sessionId, queueReportCleanup);
      } catch {
        reportInventoryCompleted = false;
        warnings.push("Report artifact inventory is pending retry.");
      }
    }

    try {
      await this.purgeSessionRows(sessionId);
    } catch {
      sessionRowsPurged = false;
      const message = "Session content cleanup is pending retry.";

      warnings.push(message);
      warn(`[SessionTerminationHandler] sessionId=${sessionId}: ${message}`);
    }

    try {
      const inventory = await supabaseAdmin.rpc("queue_legacy_document_cleanup");
      if (inventory.error) throw new Error("Temporary artifact inventory unavailable.");
      const cleanup = await drainExtractionCleanup(sessionId);
      redactedImagesPurged = cleanup.removed;
      if (cleanup.pending) warnings.push("Temporary artifact cleanup is pending retry.");
    } catch {
      warnings.push("Temporary artifact cleanup is pending retry.");
      warn("[SessionTerminationHandler] Artifact cleanup pending");
    }

    if (terminalStatus === "cancelled") {
      try {
        const cleanup = await drainReportCleanup();
        // The global drain can contain other sessions; confirm this session below.
        reportPdfPurged = reportInventoryCompleted && !cleanup.pending && sessionRowsPurged;
      } catch {
        reportPdfPurged = false;
        warnings.push("Report artifact cleanup is pending retry.");
      }
      try {
        const { data, error } = await supabaseAdmin.rpc("session_termination_state", {
          p_session_id: sessionId, p_inventory_completed: reportInventoryCompleted,
        });
        if (error || !data) throw new Error("Cleanup state unavailable.");
        cleanupPending = data.cleanupPending;
        reportPdfPurged = data.reportPdfPurged;
      } catch {
        cleanupPending = true;
        reportPdfPurged = false;
      }
      if (cleanupPending) warnings.push("Session cleanup is pending retry. Access remains revoked.");
    }

    return {
      sessionId,
      reportPdfPurged,
      redactedImagesPurged,
      sessionRowsPurged,
      sessionScrubbed,
      cleanupPending: cleanupPending || warnings.length > 0,
      warnings,
    };
  }

  private async purgeSessionRows(sessionId: string): Promise<void> {
    // RPC queues report/image references and removes draft payload atomically.
    // A failed transaction keeps the revoked parent available for monitored retry.
    const { error } = await supabaseAdmin.rpc("purge_session_content", { p_session_id: sessionId });
    if (error) throw new Error("Session content cleanup is pending retry.");
  }

  private async scrubSession(
    sessionId: string,
    terminalStatus: "cancelled" | "expired",
  ): Promise<void> {
    const update = supabaseAdmin
      .from("sessions")
      .update({
        status: terminalStatus,
        approved_profile: null,
        module_status: {
          intake: "complete",
          profile: "complete",
          analysis: "complete",
          report: "complete",
        },
        report_status: "not_started",
        last_activity: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    // Draft expiry racing with cancellation must never restore PDF access.
    const { error } = await (terminalStatus === "expired" ? update.neq("status", "cancelled") : update);

    if (error) {
      throw new Error("Failed to revoke session access.");
    }
  }
}

export const sessionTerminationHandler = new SessionTerminationHandler();

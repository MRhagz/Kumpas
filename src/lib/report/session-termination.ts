import "server-only";

import { documentStorageService } from "@/lib/module2/document-storage-service";
import { pdfFileStore } from "@/lib/report/file-store";
import { supabaseAdmin } from "@/lib/supabase";

export interface SessionTerminationResult {
  sessionId: string;
  reportPdfPurged: boolean;
  redactedImagesPurged: number;
  sessionRowsPurged: boolean;
  sessionScrubbed: boolean;
  warnings: string[];
}

export interface SessionTerminationOptions {
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
    const warn = options.warn ?? this.warn;
    let reportPdfPurged = true;
    let sessionRowsPurged = true;
    let sessionScrubbed = true;
    let redactedImagesPurged = 0;

    try {
      await pdfFileStore.deleteReportPdf(sessionId);
    } catch (error) {
      reportPdfPurged = false;
      const message =
        error instanceof Error ? error.message : "Failed to delete report PDF.";

      warnings.push(message);
      warn(`[SessionTerminationHandler] sessionId=${sessionId}: ${message}`);
    }

    try {
      const redactedImagePaths = await this.getRedactedImagePaths(sessionId);
      redactedImagesPurged = await this.purgeRedactedImages(
        sessionId,
        redactedImagePaths,
        warnings,
        warn,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to collect redacted image paths.";

      warnings.push(message);
      warn(`[SessionTerminationHandler] sessionId=${sessionId}: ${message}`);
    }

    try {
      await this.purgeSessionRows(sessionId);
    } catch (error) {
      sessionRowsPurged = false;
      const message =
        error instanceof Error
          ? error.message
          : "Failed to purge session-scoped rows.";

      warnings.push(message);
      warn(`[SessionTerminationHandler] sessionId=${sessionId}: ${message}`);
    }

    try {
      await this.scrubSession(sessionId);
    } catch (error) {
      sessionScrubbed = false;
      const message =
        error instanceof Error ? error.message : "Failed to scrub session.";

      warnings.push(message);
      warn(`[SessionTerminationHandler] sessionId=${sessionId}: ${message}`);
    }

    return {
      sessionId,
      reportPdfPurged,
      redactedImagesPurged,
      sessionRowsPurged,
      sessionScrubbed,
      warnings,
    };
  }

  private async getRedactedImagePaths(sessionId: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin
      .from("extraction_results")
      .select("redacted_image_path")
      .eq("session_id", sessionId);

    if (error) {
      throw new Error(`Failed to load redacted image paths: ${error.message}`);
    }

    return (data ?? [])
      .map((row) => row.redacted_image_path)
      .filter((path): path is string => typeof path === "string" && path.length > 0);
  }

  private async purgeRedactedImages(
    sessionId: string,
    storagePaths: string[],
    warnings: string[],
    warn: (message: string) => void,
  ): Promise<number> {
    let purgedCount = 0;

    for (const storagePath of storagePaths) {
      try {
        await documentStorageService.deleteRedacted(storagePath);
        purgedCount += 1;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `Failed to delete redacted image: ${storagePath}`;

        warnings.push(message);
        warn(`[SessionTerminationHandler] sessionId=${sessionId}: ${message}`);
      }
    }

    return purgedCount;
  }

  private async purgeSessionRows(sessionId: string): Promise<void> {
    await this.deleteRows("ranked_recommendations", {
      session_id: sessionId,
    });
    await this.deleteRows("extraction_results", {
      session_id: sessionId,
    });
    await this.deleteRows("session_notes", {
      session_id: sessionId,
    });
  }

  private async deleteRows(
    tableName: string,
    match: Record<string, unknown>,
  ): Promise<void> {
    let query = supabaseAdmin.from(tableName).delete();

    Object.entries(match).forEach(([column, value]) => {
      query = query.eq(column, value);
    });

    const { error } = await query;

    if (error) {
      throw new Error(`Failed to delete ${tableName}: ${error.message}`);
    }
  }

  private async scrubSession(sessionId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("sessions")
      .update({
        status: "cancelled",
        approved_profile: null,
        module_status: {
          intake: "complete",
          profile: "complete",
          analysis: "complete",
          report: "complete",
        },
        report_status: "downloaded",
        last_activity: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) {
      throw new Error(`Failed to scrub session: ${error.message}`);
    }
  }
}

export const sessionTerminationHandler = new SessionTerminationHandler();

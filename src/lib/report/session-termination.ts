import "server-only";

import { pdfFileStore } from "@/lib/report/file-store";

export interface SessionTerminationResult {
  sessionId: string;
  reportPdfPurged: boolean;
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

    try {
      await pdfFileStore.deleteReportPdf(sessionId);
    } catch (error) {
      reportPdfPurged = false;
      const message =
        error instanceof Error ? error.message : "Failed to delete report PDF.";

      warnings.push(message);
      warn(`[SessionTerminationHandler] sessionId=${sessionId}: ${message}`);
    }

    return {
      sessionId,
      reportPdfPurged,
      warnings,
    };
  }
}

export const sessionTerminationHandler = new SessionTerminationHandler();

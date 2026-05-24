import "server-only";

import { sessionProgressTracker } from "@/lib/module5/session-progress";

export class SessionCompletionService {
  async markReportDownloaded(sessionId: string): Promise<void> {
    const normalizedSessionId = sessionId.trim();

    if (!normalizedSessionId) {
      throw new Error("Session id is required to mark a report downloaded.");
    }

    await sessionProgressTracker.markReportDownloaded(normalizedSessionId);
  }
}

export const sessionCompletionService = new SessionCompletionService();

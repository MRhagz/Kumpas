import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

export class SessionCompletionService {
  async markReportDownloaded(sessionId: string): Promise<void> {
    const normalizedSessionId = sessionId.trim();

    if (!normalizedSessionId) {
      throw new Error("Session id is required to mark a report downloaded.");
    }

    const { error } = await supabaseAdmin
      .from("sessions")
      .update({
        status: "complete",
        last_activity: new Date().toISOString(),
      })
      .eq("id", normalizedSessionId);

    if (error) {
      throw new Error(`Failed to mark session complete: ${error.message}`);
    }
  }
}

export const sessionCompletionService = new SessionCompletionService();

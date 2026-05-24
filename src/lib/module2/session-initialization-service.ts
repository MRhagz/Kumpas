import { supabaseAdmin } from "@/lib/supabase";
import { DEFAULT_MODULE_STATUS } from "@/lib/module5/session-progress";
import type { Session } from "@/types";

export class SessionInitializationService {
  async createSession(counselorId: string): Promise<Session> {
    const { data, error } = await supabaseAdmin
      .from("sessions")
      .insert({
        counselor_id: counselorId,
        status: "active",
        module_status: DEFAULT_MODULE_STATUS,
        report_status: "not_started",
        completed_at: null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create session: ${error.message}`);
    return data as Session;
  }

  async createSessionNotes(sessionId: string, counselorId: string): Promise<void> {
    const { error } = await supabaseAdmin.from("session_notes").insert({
      session_id: sessionId,
      counselor_id: counselorId,
    });

    if (error) throw new Error(`Failed to create session notes: ${error.message}`);
  }

  async updateLastActivity(sessionId: string): Promise<void> {
    await supabaseAdmin
      .from("sessions")
      .update({ last_activity: new Date().toISOString() })
      .eq("id", sessionId);
  }
}

export const sessionInitializationService = new SessionInitializationService();

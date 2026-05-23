import { supabaseAdmin } from "@/lib/supabase";
import type { Session } from "@/types";

export class SessionInitializationService {
  async createSession(counselorId?: string): Promise<Session> {
    const { data, error } = await supabaseAdmin
      .from("sessions")
      .insert({ counselor_id: counselorId ?? null, status: "active" })
      .select()
      .single();

    if (error) throw new Error(`Failed to create session: ${error.message}`);
    return data as Session;
  }

  async createSessionNotes(sessionId: string, counselorId?: string): Promise<void> {
    const { error } = await supabaseAdmin.from("session_notes").insert({
      session_id: sessionId,
      counselor_id: counselorId ?? null,
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

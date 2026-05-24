import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export type AuthedUser = {
  id: string;
  email: string | undefined;
};

export async function requireUser(): Promise<AuthedUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email };
}

export async function userOwnsSession(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("counselor_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return false;
  return data.counselor_id === userId;
}

export function unauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function notFoundResponse() {
  return Response.json({ error: "Session not found" }, { status: 404 });
}

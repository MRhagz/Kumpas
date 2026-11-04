import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isActiveCounselor } from "@/lib/auth/counselor";

export type AuthedUser = {
  id: string;
  email: string | undefined;
};

export async function requireUser(): Promise<AuthedUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !isActiveCounselor(user)) return null;
  const { data: access, error: accessError } = await supabase.rpc("counselor_access");
  if (accessError || access !== "active") return null;
  return { id: user.id, email: user.email };
}

export async function userOwnsSession(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("counselor_id, status, expires_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return false;
  return data.counselor_id === userId &&
    (data.status === "active" || data.status === "completed") &&
    Date.parse(data.expires_at) > Date.now();
}

export function unauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, {
    status: 401, headers: { "Cache-Control": "private, no-store" },
  });
}

export function notFoundResponse() {
  return Response.json({ error: "Session not found" }, {
    status: 404, headers: { "Cache-Control": "private, no-store" },
  });
}

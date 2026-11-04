"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isInvitedCounselor, safeReturnPath } from "@/lib/auth/counselor";
import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/auth/api-auth";

export type LoginState = {
  error?: string;
};

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid email or password." };
  }

  if (!(await requireUser())) {
    await supabase.auth.signOut();
    return { error: "This account is not authorized for counselor access." };
  }

  redirect(safeReturnPath(formData.get("next")));
}

export async function activateCounselor(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !isInvitedCounselor(user) || user.app_metadata.counselor_activated === true) {
    return { error: "A valid, unused counselor invitation is required." };
  }
  const password = String(formData.get("password") ?? "");
  const { data: access, error: accessError } = await supabase.rpc("counselor_access");
  if (accessError || access !== "invited") {
    return { error: "A valid, unused counselor invitation is required." };
  }
  if (password.length < 12) return { error: "Use a password with at least 12 characters." };

  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) return { error: "Unable to set password. Please try again." };

  const { error: activationError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, counselor_activated: true },
  });
  if (activationError) return { error: "Unable to activate account. Contact the development team." };

  await supabase.auth.signOut();
  redirect("/login");
}

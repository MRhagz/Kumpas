import type { User } from "@supabase/supabase-js";

// Only Auth's administrator can set app_metadata. user_metadata is user-editable.
export function isInvitedCounselor(user: User | null): user is User {
  return Boolean(
    user && !user.is_anonymous && user.invited_at &&
    user.email_confirmed_at && user.app_metadata.role === "counselor",
  );
}

export function isActiveCounselor(user: User | null): user is User {
  return isInvitedCounselor(user) && user.app_metadata.counselor_activated === true;
}

export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/input";
  // Keep only known workflow paths; never accept an origin or a protocol-relative URL.
  if (!/^\/(input|analysis)(\?[^\\\r\n]*)?$/.test(value)) return "/input";
  return value;
}

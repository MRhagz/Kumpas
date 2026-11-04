import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isInvitedCounselor } from "@/lib/auth/counselor";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const supabase = await createClient();
  if (tokenHash && url.searchParams.get("type") === "invite") {
    const { data: { user }, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash, type: "invite",
    });
    if (!error && isInvitedCounselor(user) && !user.app_metadata.counselor_activated) {
      return NextResponse.redirect(new URL("/auth/activate", url.origin), {
        headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
      });
    }
  }
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/auth/activate?error=invitation", url.origin), {
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}

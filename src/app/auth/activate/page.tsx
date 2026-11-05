import { createClient } from "@/lib/supabase/server";
import { isInvitedCounselor } from "@/lib/auth/counselor";
import ActivationForm from "@/components/auth/activation-form";
import Link from "next/link";

export default async function ActivationPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  let eligible = false;
  if (!error && isInvitedCounselor(user) && !user.app_metadata.counselor_activated) {
    const { data: access, error: accessError } = await supabase.rpc("counselor_access");
    eligible = !accessError && access === "invited";
  }
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-4 text-2xl font-semibold">Activate counselor account</h1>
      {eligible ? <ActivationForm /> : (
        <p>This invitation is invalid, expired, or already used. Contact the development team for help.</p>
      )}
      <Link className="mt-6 block underline" href="/login">Return to sign in</Link>
    </main>
  );
}

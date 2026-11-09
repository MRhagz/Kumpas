import { ArrowLeft, CircleHelp } from "lucide-react";
import Link from "next/link";
import ActivationForm from "@/components/auth/activation-form";
import { isInvitedCounselor } from "@/lib/auth/counselor";
import { createClient } from "@/lib/supabase/server";

export default async function ActivationPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  let eligible = false;
  if (!error && isInvitedCounselor(user) && !user.app_metadata.counselor_activated) {
    const { data: access, error: accessError } = await supabase.rpc("counselor_access");
    eligible = !accessError && access === "invited";
  }
  return (
    <div className="min-h-screen bg-background font-sans text-ink">
      <main className="mx-auto max-w-5xl px-6 pt-12 sm:pt-16 lg:px-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-forest">Counselor access</p>
            <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">Activate counselor account</h1>
            <p className="mt-4 text-sm text-muted-text">Use your Kumpas invitation to set up your account.</p>
          </div>
          {eligible && (
            <Link
              href="/login"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-2xl border border-black/15 bg-cream-light/75 px-4 py-2 text-sm font-medium transition-colors hover:bg-cream-light focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest sm:self-auto"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Return to sign in
            </Link>
          )}
        </header>

        <section aria-labelledby="activation-section" className="mt-10">
          <h2 id="activation-section" className="text-sm font-semibold">
            {eligible ? "Account setup" : "Invitation status"}
          </h2>
          <div className="mt-3 rounded-[18px] border border-black/[0.08] bg-cream-light/75 p-5 sm:p-6">
            {eligible ? <ActivationForm /> : (
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Invitation unavailable</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-text">
                    This invitation is invalid, expired, or already used.
                  </p>
                </div>
                <Link
                  href="/login"
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-forest px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-forest/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest"
                >
                  Return to sign in
                  <ArrowLeft aria-hidden="true" className="size-4" />
                </Link>
              </div>
            )}
          </div>
        </section>
        {!eligible && (
          <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-text">
            <CircleHelp aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-forest" />
            Contact the development team if you need a new invitation.
          </p>
        )}
      </main>
      <footer className="mt-[72px] flex flex-col items-center gap-2 px-6 pb-10">
        <div className="h-px w-48 bg-black/[0.06]" />
        <Link href="/privacy" className="text-xs font-medium text-ink underline-offset-4 hover:underline">
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}

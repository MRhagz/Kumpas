import { ArrowLeft, Mail, MailWarning } from "lucide-react";
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
      <main className="mx-auto max-w-4xl px-6 pt-12 sm:pt-[72px]">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-forest/15 bg-forest/5 text-forest">
          <Mail aria-hidden="true" className="size-5" />
        </div>
        <header className="mt-8">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-forest">Counselor access</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Activate counselor account</h1>
          <p className="mt-3 text-sm text-muted-text">Use your Kumpas invitation to set up your account.</p>
        </header>

        <div className="mt-10 rounded-2xl border border-black/[0.08] bg-cream-light/75 p-5 sm:p-6">
          {eligible ? <ActivationForm /> : (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4 sm:items-center sm:gap-5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-forest/5 text-forest">
                  <MailWarning aria-hidden="true" className="size-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Invitation unavailable</h2>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-text">
                    This invitation is invalid, expired, or already used. Contact the development team if you need a new invitation.
                  </p>
                </div>
              </div>
              <Link
                href="/login"
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-forest/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Return to sign in
              </Link>
            </div>
          )}
        </div>
        {eligible && (
          <div className="mt-5">
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/15 bg-cream-light/75 px-4 py-2 text-sm font-medium transition-colors hover:bg-cream-light focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Return to sign in
            </Link>
          </div>
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

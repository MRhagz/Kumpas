import InputContainer from "@/components/input/input-container";
import ProtectedHeader from "@/components/auth/protected-header";
import Link from "next/link";
import { ArrowRight, Clock3, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import { requireWorkflowAccess } from "@/lib/auth/workflow-access";
import WorkflowBoundary from "@/components/auth/workflow-boundary";
import { listOwnerDrafts } from "@/lib/module5/session-state-manager";

const draftTime = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
});

export default async function InputPage({
  searchParams,
}: { searchParams: Promise<{ session?: string; new?: string }> }) {
  const { session, new: startNew } = await searchParams;
  const user = await requireWorkflowAccess("/input", session);
  let drafts: Awaited<ReturnType<typeof listOwnerDrafts>> = [];
  let draftsUnavailable = false;
  if (!session && startNew !== "1") {
    try {
      drafts = await listOwnerDrafts(user.id);
    } catch {
      console.error("[session-recovery] Failed to list saved drafts.");
      draftsUnavailable = true;
    }
  }
  return (
    <WorkflowBoundary userId={user.id}>
    <div className="min-h-screen bg-background font-sans">
      <ProtectedHeader />
      <div className="py-10">
        <Suspense
          fallback={
            <section className="mx-auto w-full max-w-4xl px-4 text-sm text-muted-text sm:px-6">
              Loading session...
            </section>
          }
        >
          {drafts.length > 0 || draftsUnavailable ? (
            <main className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-8" aria-labelledby="saved-drafts-heading">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-forest">Your workspace</p>
                  <h1 id="saved-drafts-heading" className="font-heading text-3xl leading-tight text-ink sm:text-4xl">Resume a saved draft</h1>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-text">Pick up where you left off, or begin a new counseling session.</p>
                </div>
                <Button asChild variant="outline" className="min-h-11 shrink-0 gap-2 self-start rounded-xl border-black/15 bg-cream-light px-4 text-charcoal-2 shadow-none hover:bg-cream sm:self-auto">
                  <Link href="/input?new=1"><Plus size={16} aria-hidden="true" />Start a new session</Link>
                </Button>
              </div>
              {draftsUnavailable ? (
                <div role="alert" className="mt-8 flex items-start gap-3 rounded-2xl border border-ochre/20 bg-ochre-pale p-5">
                  <TriangleAlert size={20} className="mt-0.5 shrink-0 text-ochre" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-ink">Saved drafts could not be loaded</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-text">Refresh to try again. You can also start a new session.</p>
                    <a href="/input" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-ochre underline underline-offset-4">Try again<ArrowRight size={15} className="ml-2" aria-hidden="true" /></a>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-10 mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-charcoal-2">Saved drafts</h2>
                    <span className="rounded-full bg-forest/5 px-2.5 py-1 text-xs font-medium text-forest">{drafts.length} available</span>
                  </div>
                  <ul className="space-y-3">
                    {drafts.map((draft) => (
                      <li key={draft.id}>
                        <Link prefetch={false} href={`/input?session=${encodeURIComponent(draft.id)}`} className="group flex flex-col gap-4 rounded-2xl border border-black/[0.08] bg-cream-light p-5 transition-colors hover:border-forest/30 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest sm:flex-row sm:items-center sm:gap-5 sm:p-6">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-relaxed text-ink">Draft created <time dateTime={draft.created_at}>{draftTime.format(new Date(draft.created_at))} PHT</time></p>
                            <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-muted-text"><Clock3 size={14} className="mt-0.5 shrink-0" aria-hidden="true" /><span>Expires <time dateTime={draft.expires_at}>{draftTime.format(new Date(draft.expires_at))} PHT</time></span></p>
                          </div>
                          <span className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-forest px-4 text-sm font-medium text-white transition-colors group-hover:bg-sage">Resume draft<ArrowRight size={16} aria-hidden="true" /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-text"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" /><span>Drafts are private to your account and expire 24 hours after creation.</span></p>
            </main>
          ) : <InputContainer />}
        </Suspense>
      </div>

      {/* Bottom spacer */}
      {/* Footer */}
      <footer className="pb-10 flex flex-col items-center gap-2">
        <div className="h-px w-48 bg-black/[0.06]" />
        <p className="text-xs text-muted-text">
          By using Kumpas, you agree to our{" "}
          <Link
            href="/privacy"
            className="font-medium text-ink underline-offset-4 hover:underline transition-colors"
          >
            Privacy Policy
          </Link>
          {" "}·{" "}RA 10173 Compliant
        </p>
      </footer>
    </div>
    </WorkflowBoundary>
  );
}

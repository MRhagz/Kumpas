import InputContainer from "@/components/input/input-container";
import ProtectedHeader from "@/components/auth/protected-header";
import Link from "next/link";
import { Suspense } from "react";
import { requireWorkflowAccess } from "@/lib/auth/workflow-access";
import WorkflowBoundary from "@/components/auth/workflow-boundary";
import { listOwnerDrafts } from "@/lib/module5/session-state-manager";

const draftTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
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
            <section className="mx-auto max-w-4xl space-y-4 px-4">
              <h1 className="text-2xl font-semibold">Resume a saved draft</h1>
              {draftsUnavailable && <p role="alert">Saved drafts could not be loaded. Refresh to try again.</p>}
              <ul className="space-y-3">
                {drafts.map((draft) => (
                  <li key={draft.id}>
                    <Link prefetch={false} className="underline" href={`/input?session=${encodeURIComponent(draft.id)}`}>
                      Resume draft created <time dateTime={draft.created_at}>{draftTime.format(new Date(draft.created_at))} UTC</time>
                    </Link>
                    <p>Draft expires <time dateTime={draft.expires_at}>{draftTime.format(new Date(draft.expires_at))} UTC</time></p>
                  </li>
                ))}
              </ul>
              <Link className="underline" href="/input?new=1">Start a new session</Link>
            </section>
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

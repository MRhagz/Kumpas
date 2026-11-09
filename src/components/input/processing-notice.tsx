"use client";

import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { ShieldCheck, X } from "lucide-react";

const NOTICE_KEY = "kumpas:processing-notice:v1";

interface ProcessingNoticeProps {
  confirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
  autoOpen?: boolean;
}

export default function ProcessingNotice({ confirmed, onConfirm, autoOpen = true }: ProcessingNoticeProps) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const contact = process.env.NEXT_PUBLIC_SCHOOL_PRIVACY_CONTACT;

  useEffect(() => {
    // Only the notice acknowledgment is stored here, never student information.
    let remembered = false;
    try { remembered = localStorage.getItem(NOTICE_KEY) === "acknowledged"; } catch { /* Browser storage may be disabled. */ }
    if (remembered) onConfirm(true);
    // Defer opening until hydration so the portal is created in the browser.
    else if (autoOpen) { const timer = window.setTimeout(() => setOpen(true), 0); return () => window.clearTimeout(timer); }
  }, [onConfirm, autoOpen]);

  const acceptNotice = () => {
    try { localStorage.setItem(NOTICE_KEY, "acknowledged"); } catch { /* The acknowledgment still applies to this visit. */ }
    onConfirm(true);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger className="inline-flex min-h-11 cursor-pointer items-center text-xs text-muted-text underline-offset-4 transition-colors hover:text-forest hover:underline">
          Processing &amp; privacy notice
        </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-[3px] duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-sage/15 bg-cream-light shadow-card duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <div className="relative shrink-0 border-b border-sage/15 bg-sage/[0.05] p-5 pr-14 sm:p-6 sm:pr-14">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl border border-sage/15 bg-cream-light text-forest"><ShieldCheck size={21} aria-hidden="true" /></span>
              <span className="text-xs font-semibold text-forest">Student privacy</span>
            </div>
            <Dialog.Title className="text-xl font-semibold leading-snug text-ink">Before processing student information</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-text">Prepare only what you need for career guidance.</Dialog.Description>
            <Dialog.Close aria-label="Close processing notice" className="absolute top-4 right-4 cursor-pointer flex size-10 items-center justify-center rounded-lg text-muted-text transition-colors hover:bg-sage/10"><X size={18} /></Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto p-5 text-sm leading-relaxed text-charcoal-2 sm:p-6">
            <div className="space-y-5">
              <section>
                <h3 className="font-semibold text-ink">What to include</h3>
                <p className="mt-1.5">For licensed guidance counselors assisting Grade 10 and Senior High School students. Submit a prepared career-interview summary, typed or photographed. Form 137, NCAE and NAT records are optional.</p>
                <p className="mt-2 text-muted-text">Career Goal (including Undecided) and Personal Interests and Strengths are required. The other three note fields are optional.</p>
              </section>
              <section className="border-t border-black/[0.08] pt-5">
                <h3 className="font-semibold text-ink">What to leave out</h3>
                <p className="mt-1.5">Remove names, birthdates, student IDs and confidential details from your notes. Typed notes are not automatically redacted. Do not submit complete confidential counseling records.</p>
              </section>
              <details className="rounded-xl border border-sage/20 bg-sage/[0.03] px-4 py-3">
                <summary className="cursor-pointer font-medium text-forest">How information is processed &amp; stored</summary>
                <div className="mt-3 space-y-3 text-xs leading-relaxed text-muted-text">
                  <p>Vercel hosts application processing. Supabase provides authentication and restricted temporary session storage. Uploads are staged privately in Supabase for extraction. The approved paid Gemini service processes submitted images directly for extraction and approved inputs for automated career analysis. Typed-only notes skip image extraction.</p>
                  <p>The approved handling policy limits session access to the owning counselor and authorized service operations. Recovery drafts expire 24 hours after creation; server PDFs expire 24 hours after generation or earlier Cancel or End Session.</p>
                  <p>Raw uploads are deleted after processing. Failed deletions are queued for retry; abandoned uploads expire after 10 minutes and are collected by scheduled cleanup. An upload already processing has a separate six-minute recovery allowance.</p>
                  <p>Restricted academic correction logs are retained for 12 calendar months and exclude counselor notes. Save approved reports through the school’s approved process. Application deletion does not determine Gemini’s separate provider retention terms.</p>
                  <p>Before using real records, confirm the approved deployment’s storage, deletion and provider terms with {contact || "your school’s designated privacy contact"}.</p>
                </div>
              </details>
              <p className="text-xs leading-relaxed text-muted-text">Recommendations are advisory, may be limited by missing academic evidence, and require counselor review before release.</p>
            </div>
          </div>
          <div className="shrink-0 space-y-4 border-t border-sage/15 bg-cream/60 p-5 sm:px-6">
            <label className="flex cursor-default has-[:disabled]:cursor-not-allowed items-start gap-3 text-xs leading-relaxed text-charcoal-2">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-default accent-forest disabled:cursor-not-allowed" checked={acknowledged || confirmed} onChange={(event) => setAcknowledged(event.target.checked)} disabled={confirmed} />
              <span>I have read this notice and confirm that any prepared note photograph I submit excludes personal identifiers and confidential details.</span>
            </label>
            <button type="button" disabled={!acknowledged && !confirmed} onClick={acceptNotice} className="flex min-h-11 cursor-pointer w-full items-center justify-center rounded-xl bg-forest px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-sage disabled:cursor-not-allowed disabled:opacity-40">Continue to intake</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

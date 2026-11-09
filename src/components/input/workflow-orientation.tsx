"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import ProcessingNotice from "./processing-notice";

const ORIENTATION_KEY = "kumpas:workflow-orientation:v1";
const stages = [
  {
    title: "Intake",
    action: "Start with your interview notes.",
    description: "Type a prepared summary or extract it from a photograph. Fill in Career Goal and Personal Interests & Strengths. Undecided is a valid career goal.",
    detail: "Academic documents and the other three note fields are optional. Leave out personal identifiers and confidential details.",
    image: "/orientation/intake.webp",
    alt: "Kumpas counselor notes with the required career goal and interests fields filled with sample information.",
  },
  {
    title: "Confirm Information",
    action: "Check what will be submitted.",
    description: "Review your notes, extracted academic values and any missing evidence. Correct errors and save your changes, then approve the exact inputs for analysis.",
    detail: "Missing academic evidence is allowed. Changing saved inputs later requires approval and a new analysis.",
    image: "/orientation/confirm.webp",
    alt: "The Confirm Information panel showing missing academic evidence, a saved draft and the input approval button.",
  },
  {
    title: "Analysis",
    action: "Let Kumpas work from the approved inputs.",
    description: "AI uses your confirmed notes and available academic evidence to prepare advisory career suggestions. Wait for the draft report to finish.",
    detail: "Missing evidence and partial failures stay visible. You can return to correct inputs if needed.",
    image: "/orientation/analysis.webp",
    alt: "Kumpas analyzing approved inputs and explaining how missing evidence is handled.",
  },
  {
    title: "Review Report",
    action: "Review before releasing the report.",
    description: "Read the student summary, counselor evidence, limitations and sources. Preview the PDF, then approve that report version when it is ready.",
    detail: "You make the final guidance decision. If the report needs changes, correct the inputs or regenerate it and review the new version.",
    image: "/orientation/review.webp",
    alt: "Counselor review with controls to preview, approve, reject or regenerate a draft report.",
  },
  {
    title: "Download",
    action: "Save the approved report.",
    description: "Download the approved PDF before its expiry and save it through your school’s approved process. End the session when you are finished.",
    detail: "Drafts expire 24 hours after creation; PDFs expire 24 hours after generation. Sign in as the same counselor to resume eligible work. Ending a session revokes access and shows cleanup status. Downloaded copies follow school policy.",
    image: "/orientation/download.webp",
    alt: "An approved Kumpas report with its expiry information and Download PDF button.",
  },
];

export default function WorkflowOrientation({ confirmed, onConfirm }: {
  confirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [readyForNotice, setReadyForNotice] = useState(false);
  const stage = stages[step];
  const lastStage = step === stages.length - 1;

  useEffect(() => {
    let remembered = false;
    try { remembered = localStorage.getItem(ORIENTATION_KEY) === "seen"; } catch { /* Browser storage may be disabled. */ }
    const timer = window.setTimeout(() => {
      if (remembered) setReadyForNotice(true);
      else setOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(ORIENTATION_KEY, "seen"); } catch { /* Dismissal still applies to this visit. */ }
    setOpen(false);
    setReadyForNotice(true);
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(nextOpen) => {
        if (nextOpen) { setStep(0); setOpen(true); }
        else dismiss();
      }}>
        <Dialog.Trigger className="inline-flex min-h-11 cursor-pointer items-center text-xs text-muted-text underline-offset-4 transition-colors hover:text-forest hover:underline">
          How this works
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-200" />
          <Dialog.Content onPointerDownOutside={(event) => event.preventDefault()} className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-sage/15 bg-cream-light shadow-card duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
            <header className="relative shrink-0 border-b border-sage/15 px-5 pt-5 pb-4 sm:px-8 sm:pt-7 sm:pb-5">
              <p className="mb-2 text-xs font-medium text-forest">Orientation</p>
              <Dialog.Title className="pr-10 font-heading text-2xl font-semibold leading-tight text-ink sm:text-3xl">Your counseling workflow</Dialog.Title>
              <Dialog.Description className="mt-2 pr-8 text-sm text-muted-text">Five stages, from your interview notes to an approved report.</Dialog.Description>
              <Dialog.Close aria-label="Skip orientation" className="absolute top-4 right-4 cursor-pointer flex size-10 items-center justify-center rounded-lg text-muted-text transition-colors hover:bg-sage/10 hover:text-ink"><X size={19} aria-hidden="true" /></Dialog.Close>
              <ol aria-label="Orientation stages" className="mt-5 flex gap-2">
                {stages.map((item, index) => (
                  <li key={item.title} aria-current={index === step ? "step" : undefined} className="min-w-0 flex-1">
                    <span aria-hidden="true" className={`block h-1 rounded-full transition-colors duration-200 ${index <= step ? "bg-forest" : "bg-sage/15"}`} />
                    <span className="sr-only">{index + 1}. {item.title}</span>
                  </li>
                ))}
              </ol>
            </header>
            <div className="min-h-0 overflow-y-auto">
              <div key={step} className="grid animate-in fade-in-0 slide-in-from-right-2 duration-200 md:min-h-[25rem] md:grid-cols-[1.2fr_1fr]">
                <figure className="flex min-w-0 flex-col justify-center border-b border-sage/15 bg-cream/70 p-5 sm:p-8 md:border-r md:border-b-0">
                  <div className="relative h-52 w-full sm:h-64 md:h-80">
                    <Image src={stage.image} alt={stage.alt} fill sizes="(min-width: 1024px) 500px, (min-width: 768px) 50vw, 90vw" className="object-contain" />
                  </div>
                  <figcaption className="mt-3 text-center text-[11px] text-muted-text">Example screen · sample information</figcaption>
                </figure>
                <section aria-live="polite" aria-atomic="true" className="flex flex-col justify-center p-5 sm:p-8">
                  <p className="text-xs font-medium text-forest">Stage {step + 1} of {stages.length}</p>
                  <h2 className="mt-2 font-heading text-2xl font-semibold leading-tight text-ink sm:text-3xl">{stage.title}</h2>
                  <h3 className="mt-5 text-sm font-semibold leading-relaxed text-ink">{stage.action}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-charcoal-2">{stage.description}</p>
                  <p className="mt-4 text-xs leading-relaxed text-muted-text">{stage.detail}</p>
                </section>
              </div>
            </div>
            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-sage/15 bg-cream/40 px-5 py-4 sm:px-8 sm:py-5">
              <div className="flex items-center gap-1 sm:gap-3">
                <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm text-muted-text transition-colors hover:bg-sage/5 hover:text-forest disabled:pointer-events-none disabled:opacity-35 sm:px-3"><ArrowLeft size={16} aria-hidden="true" />Back</button>
                <button type="button" disabled={lastStage} onClick={() => setStep(step + 1)} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-forest transition-colors hover:bg-sage/5 disabled:pointer-events-none disabled:opacity-35 sm:px-3">Next<ArrowRight size={16} aria-hidden="true" /></button>
              </div>
              <button type="button" disabled={!lastStage} onClick={() => { if (lastStage) dismiss(); }} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sage disabled:cursor-not-allowed disabled:opacity-35 sm:px-5">{lastStage && <Check size={16} aria-hidden="true" />}Got it</button>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ProcessingNotice confirmed={confirmed} onConfirm={onConfirm} autoOpen={readyForNotice} />
    </>
  );
}

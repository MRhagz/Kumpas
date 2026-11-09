"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, Clock3, LoaderCircle, Plus, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function SessionTerminationControl({ sessionId, open, onOpenChange, onTerminating, label = "End Session", compact = false }: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTerminating: () => void;
  label?: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<"working" | "busy" | "pending" | "uncertain" | "complete">("working");
  const trigger = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const terminate = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    onOpenChange(false);
    onTerminating();
    setState("busy");
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok || body.status !== "terminated") throw new Error("Termination unconfirmed");
      setState(body.cleanupPending ? "pending" : "complete");
    } catch {
      // The request may have committed. Keep content hidden until a retry confirms.
      setState("uncertain");
    } finally { inFlight.current = false; }
  };

  const ended = state === "complete" || state === "pending";
  const StatusIcon = state === "complete" ? ShieldCheck : state === "pending" ? Clock3 : state === "busy" ? LoaderCircle : TriangleAlert;

  return <div className={state === "working" ? (compact ? "" : "py-1") : "my-4 flex min-h-[65svh] w-full items-center justify-center py-8 sm:py-12"}>
    {state === "working" ? <Button ref={trigger} type="button" variant="outline" size={compact ? "sm" : "default"}
      className={`cursor-pointer border-red-soft/20 bg-transparent text-xs font-medium text-red-soft shadow-none transition-colors hover:border-red-soft/40 hover:bg-red-soft/5 active:bg-red-soft/10 ${compact ? "gap-1.5 rounded-lg px-2.5" : "min-h-11 gap-2 rounded-xl px-4"}`}
      aria-haspopup="dialog" aria-expanded={open}
      onClick={() => onOpenChange(true)}><X size={16} aria-hidden="true" />{label}</Button> : (
      <section className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-cream-dark bg-cream-light px-6 py-10 text-center shadow-[0_12px_48px_-24px_rgba(26,26,24,0.18)] sm:px-12 sm:py-12" aria-labelledby="session-ended-heading">
        <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${state === "complete" ? "bg-forest" : state === "busy" ? "bg-cream-dark" : "bg-ochre"}`} />
        <div className={`relative mx-auto mb-7 flex size-20 items-center justify-center rounded-full border ${
          state === "complete" ? "border-forest/15 bg-forest/[0.06] text-forest" :
          state === "busy" ? "border-cream-dark bg-cream text-charcoal-3" : "border-ochre/15 bg-ochre-light/50 text-ochre"
        }`}>
          <StatusIcon size={32} strokeWidth={1.4} className={state === "busy" ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden="true" />
          {state === "complete" && <span className="absolute -right-0.5 bottom-0 flex size-6 items-center justify-center rounded-full border-[3px] border-cream-light bg-forest text-white"><Check size={12} strokeWidth={2.5} aria-hidden="true" /></span>}
        </div>
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-text">
          {ended ? "Session closed" : state === "busy" ? "Closing session" : "Action needed"}
        </p>
        <div ref={status} tabIndex={-1} role="status" aria-live="polite" aria-atomic="true" className="rounded-lg">
          <h1 id="session-ended-heading" className="font-heading text-[32px] leading-tight font-normal tracking-tight text-charcoal sm:text-4xl">
            {ended ? "Session ended" : state === "busy" ? "Ending your session…" : "Let’s confirm that’s closed"}
          </h1>
          <p className="mx-auto mt-4 max-w-xs text-sm leading-7 text-muted-text">
            {state === "busy" ? "Ending session and checking cleanup…" :
              state === "complete" ? "Session content and server files have been deleted." :
              state === "pending" ? "Access is revoked. Cleanup is pending and will retry automatically." :
              "Termination could not be confirmed. Retry ending this session before continuing."}
          </p>
        </div>
        <div className="mt-8 space-y-3 border-t border-cream-dark/70 pt-7">
          {ended && <Button asChild className="min-h-12 w-full gap-2 rounded-xl bg-forest px-5 text-white shadow-none hover:bg-sage">
            <a href="/input?new=1"><Plus size={16} aria-hidden="true" />Start a new session<ArrowRight size={16} className="ml-auto" aria-hidden="true" /></a>
          </Button>}
          {(state === "pending" || state === "uncertain") && <Button type="button" variant="outline"
            className="min-h-12 w-full cursor-pointer rounded-xl border-cream-dark bg-transparent text-charcoal-2 shadow-none hover:bg-cream" onClick={terminate}>
            {state === "pending" ? "Retry cleanup" : "Retry ending session"}
          </Button>}
          {state === "complete" && <p className="pt-1 text-xs leading-5 text-muted-text">This session can no longer be reopened.</p>}
          {state === "busy" && <p className="text-xs leading-5 text-muted-text">Please wait while we confirm your session is closed.</p>}
        </div>
      </section>
    )}
    <AlertDialog open={open && state === "working"} onOpenChange={onOpenChange}>
      <AlertDialogContent onCloseAutoFocus={event => {
        event.preventDefault();
        if (state === "working") trigger.current?.focus();
        else status.current?.focus();
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>End this session?</AlertDialogTitle>
          <AlertDialogDescription>
            You will lose this session, including unsaved changes, notes, academic inputs, analysis and server PDFs.
            Access ends immediately after confirmation. This cannot be undone.
            Academic correction logs follow their separate retention policy.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">Keep Working</AlertDialogCancel>
          <AlertDialogAction className="cursor-pointer bg-red-600 text-white hover:bg-red-700" onClick={terminate}>End session</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function SessionTerminationControl({ sessionId, open, onOpenChange, onTerminating, label = "End Session" }: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTerminating: () => void;
  label?: string;
}) {
  const [state, setState] = useState<"working" | "busy" | "pending" | "uncertain" | "complete">("working");
  const trigger = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
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

  return <div className="my-4 space-y-3">
    {state === "working" ? <Button ref={trigger} type="button" variant="outline"
      className="min-h-11 cursor-pointer gap-2 rounded-xl border-black/15 bg-cream-light px-4 text-charcoal-2 shadow-none transition-colors hover:border-red-soft/50 hover:bg-red-soft/10 hover:text-red-soft active:bg-red-soft/15"
      aria-haspopup="dialog" aria-expanded={open}
      onClick={() => onOpenChange(true)}><X size={16} aria-hidden="true" />{label}</Button> : <>
      <p ref={status} tabIndex={-1} role="status" aria-live="polite">
        {state === "busy" ? "Ending session and checking cleanup…" :
          state === "complete" ? "Session ended. Session content and server files have been deleted." :
          state === "pending" ? "Session ended. Access is revoked. Cleanup is pending and will retry automatically." :
          "Termination could not be confirmed. Retry ending this session before continuing."}
      </p>
      {(state === "pending" || state === "uncertain") && <Button type="button" variant="outline"
        className="min-h-11 cursor-pointer" onClick={terminate}>
        {state === "pending" ? "Retry cleanup" : "Retry ending session"}
      </Button>}
      {(state === "pending" || state === "complete") && <a className="ml-3 underline" href="/input?new=1">Start a new session</a>}
    </>}
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

"use client";

import { useRef, useState } from "react";
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
    {state === "working" ? <button type="button" className="rounded border border-black/20 px-3 py-2 text-sm"
      onClick={() => onOpenChange(true)}>{label}</button> : <>
      <p role="status" aria-live="polite">
        {state === "busy" ? "Ending session and checking cleanup…" :
          state === "complete" ? "Session ended. Session content and server files have been deleted." :
          state === "pending" ? "Session ended. Access is revoked. Cleanup is pending and will retry automatically." :
          "Termination could not be confirmed. Retry ending this session before continuing."}
      </p>
      {(state === "pending" || state === "uncertain") && <button type="button"
        className="rounded border border-black/20 px-3 py-2 text-sm" onClick={terminate}>
        {state === "pending" ? "Retry cleanup" : "Retry ending session"}
      </button>}
      {(state === "pending" || state === "complete") && <a className="ml-3 underline" href="/input?new=1">Start a new session</a>}
    </>}
    <AlertDialog open={open && state === "working"} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End this session?</AlertDialogTitle>
          <AlertDialogDescription>
            You will lose this session, including unsaved changes, notes, academic inputs, analysis and server PDFs.
            Access ends immediately after confirmation. This cannot be undone.
            Academic correction logs follow their separate retention policy.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Working</AlertDialogCancel>
          <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={terminate}>End session</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

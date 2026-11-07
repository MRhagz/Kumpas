"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const stages = ["Intake", "Confirm Information", "Analysis", "Review Report", "Download"];
interface ProgressState {
  expiresAt: string;
  nextStep: string;
  hasApprovedProfile: boolean;
  hasReport: boolean;
  reportReviewStatus: "draft" | "approved" | "rejected" | null;
  analysisRetryRequired?: boolean;
}
export default function SessionProgressIndicator({ sessionId, fallbackStep, confirming = false, refreshToken, className }: {
  sessionId?: string | null;
  fallbackStep: "upload" | "analysis" | "report";
  confirming?: boolean;
  refreshToken?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState<{ id: string; state: ProgressState; expired: boolean } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    let request = 0;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const current = ++request;
      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const state = await response.json() as ProgressState;
        if (!controller.signal.aborted && current === request) {
          setLoaded({ id: sessionId, state, expired: state.nextStep === "start-new-session" || Date.parse(state.expiresAt) <= Date.now() });
          setUnavailable(false);
          if (expiryTimer) clearTimeout(expiryTimer);
          const remaining = Date.parse(state.expiresAt) - Date.now();
          if (remaining > 0 && remaining < 2147483647) expiryTimer = setTimeout(() => {
            setLoaded(previous => previous?.id === sessionId ? { ...previous, expired: true } : previous);
          }, remaining);
        }
      } catch {
        if (!controller.signal.aborted && current === request) { setLoaded(null); setUnavailable(true); }
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { controller.abort(); if (expiryTimer) clearTimeout(expiryTimer); window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [sessionId, fallbackStep, confirming, refreshToken]);
  const state = loaded && loaded.id === sessionId ? loaded.state : null;
  const expired = loaded && loaded.id === sessionId && loaded.expired;
  // A page URL never marks a prerequisite complete. Confirmation may be active for a saved intake,
  // while only server approval unlocks analysis and only report approval unlocks download.
  const active = !state || expired ? -1 : !state.hasApprovedProfile ? (confirming ? 1 : 0)
    : !state.hasReport ? 2 : state.reportReviewStatus === "approved" ? 4 : 3;
  return <nav aria-label="Counselor workflow" className={cn("mx-auto w-full max-w-4xl px-4 sm:px-6", className)}>
    <ol className="flex flex-wrap gap-x-4 gap-y-2 py-2 text-xs">
      {stages.map((stage, index) => <li key={stage} aria-current={active === index ? "step" : undefined}
        className={active === index ? "font-bold text-forest" : "text-muted-text"}>
        {index + 1}. {stage} <span className="sr-only">{active === index ? "Current stage" : active > index ? "Complete" : "Pending"}</span>
      </li>)}
    </ol>
    {!state ? <p role="status" className="text-xs">{unavailable ? "Progress could not be confirmed. Reconnect or sign in again to resume saved work." : "Checking saved progress…"}</p>
      : expired ? <p role="status">This draft has expired. Start a new session; expired work cannot resume.</p>
      : <p className="text-xs text-muted-text">Draft expires <time dateTime={state.expiresAt}>{new Date(state.expiresAt).toLocaleString()}</time>. Activity does not extend this deadline.
        {state.analysisRetryRequired && " Analysis needs a retry. Your approved inputs are saved."}
        {state.reportReviewStatus === "rejected" && " Report rejected. Correct inputs or regenerate before approval."}
      </p>}
  </nav>;
}

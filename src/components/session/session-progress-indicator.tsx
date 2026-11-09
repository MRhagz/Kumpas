"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const stages = ["Intake", "Confirm Info", "Analysis", "Review Report", "Download"];
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
    <ol className="flex items-start py-4 sm:py-5">
      {stages.map((stage, index) => <li key={stage} aria-current={active === index ? "step" : undefined}
        className={cn("relative flex min-w-0 flex-1 flex-col items-center text-center last:flex-none last:w-1/5 md:flex-auto md:flex-row md:items-start md:text-left md:last:w-auto",
          active === index ? "font-semibold text-forest" : "text-muted-text")}>
        <div className="relative z-10 flex min-w-0 flex-col items-center gap-2 md:shrink-0 md:flex-row md:items-start">
        <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-4 ring-cream md:size-9",
          active >= index ? "bg-forest text-white" : "bg-cream-dark text-muted-text")}>
          {active > index ? <Check size={16} /> : index + 1}
        </span>
        <span className="min-w-0 px-1 text-[11px] leading-snug md:max-w-28 md:px-0 md:text-sm md:whitespace-nowrap">
          <span className="sr-only">{index + 1}. </span>{stage}
          <span className="mt-1 hidden text-xs font-normal md:block">{active === index ? "Current stage" : active > index ? "Complete" : "Pending"}</span>
        </span>
        </div>
        {index < stages.length - 1 && <span aria-hidden="true" className="absolute top-4 left-1/2 h-px w-full md:static md:mx-2 md:mt-[18px] md:w-auto md:min-w-2 md:flex-1">
          <span className={cn("block h-px w-full md:mx-auto md:w-12 md:max-w-full", active > index ? "bg-forest" : "bg-black/15")} />
        </span>}
      </li>)}
    </ol>
    {!state ? <p role="status" className="text-xs">{unavailable ? "Progress could not be confirmed. Reconnect or sign in again to resume saved work." : "Checking saved progress…"}</p>
      : expired ? <p role="status">This draft has expired. Start a new session; expired work cannot resume.</p>
      : (state.analysisRetryRequired || state.reportReviewStatus === "rejected") && <p role="status" className="text-xs text-muted-text">
        {state.analysisRetryRequired && "Analysis needs a retry. Your approved inputs are saved."}
        {state.reportReviewStatus === "rejected" && " Report rejected. Correct inputs or regenerate before approval."}
      </p>}
  </nav>;
}

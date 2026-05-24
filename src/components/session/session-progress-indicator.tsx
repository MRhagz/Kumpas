"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, FileDown, Sparkles, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type SessionStep = "upload" | "confirm" | "analysis" | "report";
type StepState = "complete" | "active" | "pending" | "failed";
type ModuleProgressStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "failed";
type ReportStatus =
  | "not_started"
  | "generating"
  | "ready"
  | "downloaded"
  | "failed";

interface SessionProgressIndicatorProps {
  sessionId?: string | null;
  fallbackStep: SessionStep;
}

interface SessionStateResponse {
  nextStep: "input" | "analysis" | "report" | "complete" | "start-new-session";
  moduleStatus: {
    intake: ModuleProgressStatus;
    profile: ModuleProgressStatus;
    analysis: ModuleProgressStatus;
    report: ModuleProgressStatus;
  };
  reportStatus: ReportStatus;
}

const STEPS: Array<{
  key: SessionStep;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "upload", label: "Upload", icon: Upload },
  { key: "confirm", label: "Confirm", icon: ClipboardCheck },
  { key: "analysis", label: "Analysis", icon: Sparkles },
  { key: "report", label: "Report", icon: FileDown },
];

export default function SessionProgressIndicator({
  sessionId,
  fallbackStep,
}: SessionProgressIndicatorProps) {
  const [loadedSession, setLoadedSession] = useState<{
    sessionId: string;
    state: SessionStateResponse;
  } | null>(null);

  useEffect(() => {
    const currentSessionId = sessionId ?? "";
    if (!currentSessionId) return;

    let isMounted = true;

    async function loadSessionState() {
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(currentSessionId)}`,
          { cache: "no-store" },
        );

        if (!response.ok) return;

        const body = (await response.json()) as SessionStateResponse;
        if (isMounted) {
          setLoadedSession({ sessionId: currentSessionId, state: body });
        }
      } catch {
        // The indicator is read-only; fallback state is enough if refresh fails.
      }
    }

    loadSessionState();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const sessionState =
    loadedSession && loadedSession.sessionId === sessionId
      ? loadedSession.state
      : null;

  const stepStates = useMemo(
    () => getStepStates(sessionState, fallbackStep),
    [fallbackStep, sessionState],
  );

  return (
    <nav
      aria-label="Session progress"
      className="mx-auto w-full max-w-4xl px-4 sm:px-6"
    >
      <ol className="grid grid-cols-4 overflow-hidden rounded-xl border border-black/[0.06] bg-white/70 shadow-sm">
        {STEPS.map((step, index) => {
          const state = stepStates[step.key];
          const Icon = state === "complete" ? Check : step.icon;

          return (
            <li
              key={step.key}
              aria-current={state === "active" ? "step" : undefined}
              className={`relative flex min-h-14 items-center justify-center gap-2 px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider sm:text-xs ${
                state === "active"
                  ? "bg-sage text-white"
                  : state === "complete"
                    ? "bg-sage/[0.08] text-sage"
                    : state === "failed"
                      ? "bg-red-light text-red-soft"
                      : "text-muted-text"
              }`}
            >
              {index > 0 && (
                <span className="absolute left-0 top-3 bottom-3 w-px bg-black/[0.06]" />
              )}
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  state === "active"
                    ? "bg-white/20"
                    : state === "complete"
                      ? "bg-white text-sage"
                      : state === "failed"
                        ? "bg-white text-red-soft"
                        : "bg-cream-dark text-muted-text"
                }`}
              >
                <Icon size={14} />
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function getStepStates(
  sessionState: SessionStateResponse | null,
  fallbackStep: SessionStep,
): Record<SessionStep, StepState> {
  if (!sessionState) {
    return buildSequentialStates(fallbackStep, new Set());
  }

  const completeSteps = new Set<SessionStep>();
  const failedSteps = new Set<SessionStep>();

  if (
    sessionState.moduleStatus.intake === "complete" ||
    sessionState.moduleStatus.profile === "complete"
  ) {
    completeSteps.add("upload");
  }

  if (sessionState.moduleStatus.profile === "complete") {
    completeSteps.add("confirm");
  }

  if (sessionState.moduleStatus.analysis === "complete") {
    completeSteps.add("analysis");
  }

  if (
    sessionState.moduleStatus.report === "complete" ||
    sessionState.reportStatus === "ready" ||
    sessionState.reportStatus === "downloaded"
  ) {
    completeSteps.add("report");
  }

  if (sessionState.moduleStatus.analysis === "failed") {
    failedSteps.add("analysis");
  }

  if (
    sessionState.moduleStatus.report === "failed" ||
    sessionState.reportStatus === "failed"
  ) {
    failedSteps.add("report");
  }

  return buildSequentialStates(
    getActiveStep(sessionState, fallbackStep),
    completeSteps,
    failedSteps,
  );
}

function getActiveStep(
  sessionState: SessionStateResponse,
  fallbackStep: SessionStep,
): SessionStep {
  if (
    sessionState.nextStep === "report" ||
    sessionState.nextStep === "complete" ||
    sessionState.reportStatus === "generating" ||
    sessionState.reportStatus === "ready" ||
    sessionState.reportStatus === "downloaded"
  ) {
    return "report";
  }

  if (
    sessionState.nextStep === "analysis" ||
    sessionState.moduleStatus.analysis === "in_progress"
  ) {
    return "analysis";
  }

  if (sessionState.moduleStatus.profile === "complete") {
    return "analysis";
  }

  if (sessionState.moduleStatus.intake === "complete") {
    return "confirm";
  }

  return fallbackStep;
}

function buildSequentialStates(
  activeStep: SessionStep,
  completeSteps: Set<SessionStep>,
  failedSteps = new Set<SessionStep>(),
): Record<SessionStep, StepState> {
  return STEPS.reduce(
    (states, step) => {
      if (failedSteps.has(step.key)) {
        states[step.key] = "failed";
      } else if (step.key === activeStep) {
        states[step.key] = completeSteps.has(step.key) ? "complete" : "active";
      } else if (completeSteps.has(step.key)) {
        states[step.key] = "complete";
      } else {
        states[step.key] = "pending";
      }

      return states;
    },
    {} as Record<SessionStep, StepState>,
  );
}

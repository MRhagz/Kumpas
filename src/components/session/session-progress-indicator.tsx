"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

type SessionStep = "upload" | "analysis" | "report";
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
  className?: string;
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
}> = [
  { key: "upload", label: "Upload" },
  { key: "analysis", label: "Analysis" },
  { key: "report", label: "Report" },
];

export default function SessionProgressIndicator({
  sessionId,
  fallbackStep,
  className,
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
    <Breadcrumb className={cn("mx-auto w-full max-w-4xl px-4 sm:px-6", className)}>
      <BreadcrumbList className="w-full flex-nowrap justify-start gap-2 py-1">
        {STEPS.map((step, index) => {
          const state = stepStates[step.key];

          return (
            <Fragment key={step.key}>
              {index > 0 && (
                <BreadcrumbSeparator className="shrink-0 text-black/30" />
              )}
              <BreadcrumbItem className="min-w-0 gap-2">
                <BreadcrumbPage
                  aria-current={state === "active" ? "step" : undefined}
                  className={`inline-flex min-w-0 items-center justify-center text-[10px] uppercase tracking-wider sm:text-[11px] ${
                    state === "active"
                      ? "font-bold text-sage"
                      : state === "complete"
                        ? "font-medium text-sage"
                        : state === "failed"
                          ? "font-semibold text-red-soft"
                          : "font-medium text-muted-text"
                  }`}
                >
                  <span>{step.label}</span>
                </BreadcrumbPage>
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
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
  if (fallbackStep === "report") {
    return "report";
  }

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
        states[step.key] = "active";
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

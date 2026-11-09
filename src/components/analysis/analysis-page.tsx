"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import LoadingScreen from "@/components/analysis/loading-screen";
import ProtectedHeader from "@/components/auth/protected-header";
import SessionProgressIndicator from "@/components/session/session-progress-indicator";
import SessionTerminationControl from "@/components/session/session-termination-control";

import type { StageName } from "@/lib/analysis-types";
import type { ReportGenerationResponse } from "@/lib/report/types";

import ErrorView from "@/components/analysis/error-view";
import { processingHttpError } from "@/lib/processing-http-error";
import ReportDownloadView from "@/components/analysis/report-download-view";
import type { SpecialistStatus } from "@/lib/module3/types";

type AnalysisPageState =
  | { phase: "processing"; completedStages: StageName[]; agentStatuses?: SpecialistStatus[]; isPartial?: boolean }
  | { phase: "reportReady"; report: ReportGenerationResponse }
  | { phase: "unavailable" }
  | { phase: "error"; message: string };

interface SessionStateResponse {
  profileVersion: number;
  currentReportVersion: number;
  reportReviewStatus: "draft" | "approved" | "rejected" | null;
  currentRunId?: string | null;
  analysisRetryRequired?: boolean;
  processingInProgress?: boolean;
  sessionId: string;
  nextStep: "input" | "analysis" | "report" | "complete" | "start-new-session";
  hasApprovedProfile: boolean;
  reportStatus: "not_started" | "generating" | "ready" | "downloaded" | "failed";
}

function AnalysisContent() {
  const [state, setState] = useState<AnalysisPageState>({
    phase: "processing",
    completedStages: [],
  });
  const hasRun = useRef(false);
  const recoveryRequest = useRef<AbortController | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session");

  const [terminationOpen, setTerminationOpen] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const onNewSession = () => setTerminationOpen(true);

  const generateReport = useCallback(async (runId: string, signal: AbortSignal) => {
    if (!sessionId) {
      throw new Error("No session ID found. Please start a new session.");
    }

    const reportRes = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, runId }),
    });
    if (reportRes.status === 401) redirectToLogin(sessionId);
    const reportBody = await reportRes.json().catch(() => null);

    if (!reportRes.ok) {
      throw new Error(
        getReportGenerationErrorMessage(reportRes.status, reportBody),
      );
    }

    const current = await fetchSessionState(sessionId, signal);
    if (signal.aborted) return;
    if (current?.currentRunId !== runId || !current.hasApprovedProfile ||
      !["report", "complete"].includes(current.nextStep) || current.currentReportVersion !== reportBody.reportVersion ||
      current.reportReviewStatus !== reportBody.reviewStatus) {
      throw new Error("Inputs changed. Return to Confirm Information and approve the current values.");
    }
    setState({ phase: "reportReady", report: reportBody });
  }, [sessionId]);

  const runPipeline = useCallback(async (retry = false, expectedRunId?: string) => {
    if (!sessionId) {
      setState({ phase: "error", message: "No session ID found. Please start a new session." });
      return;
    }

    recoveryRequest.current?.abort();
    const controller = new AbortController();
    recoveryRequest.current = controller;
    const { signal } = controller;
    setState({ phase: "processing", completedStages: [] });

    const markStages = (stages: StageName[], agentStatuses?: SpecialistStatus[], isPartial = false) => {
      if (!signal.aborted) setState({ phase: "processing", completedStages: stages, agentStatuses, isPartial });
    };


    try {
      let sessionState = await fetchSessionState(sessionId, signal);
      while (sessionState?.processingInProgress) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (signal.aborted) return;
        sessionState = await fetchSessionState(sessionId, signal);
      }

      if (!sessionState || sessionState.nextStep === "start-new-session") {
        setState({ phase: "unavailable" });
        return;
      }

      if (expectedRunId && sessionState.currentRunId !== expectedRunId) {
        throw new Error("This regeneration was superseded. Reload the current report before continuing.");
      }

      if (sessionState.nextStep === "input" || !sessionState.hasApprovedProfile) {
        router.replace(`/input?session=${encodeURIComponent(sessionId)}`);
        return;
      }

      if (!retry && sessionState.analysisRetryRequired) {
        throw new Error("The previous analysis stopped. Your approved inputs are saved. Retry analysis or return to Confirm Information.");
      }

      if (sessionState.nextStep === "report" || sessionState.nextStep === "complete") {
        if (!sessionState.currentRunId) throw new Error("Return to Confirm Information and approve inputs to start a timed analysis.");
        await generateReport(sessionState.currentRunId, signal);
        return;
      }

      const res = await fetch(`/api/sessions/${sessionId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: sessionState.currentRunId, profileVersion: sessionState.profileVersion,
          ...(retry && sessionState.analysisRetryRequired ? { retryRunId: sessionState.currentRunId ?? null } : {}) }),
      });

      if (!res.ok) {
        if (res.status === 401) redirectToLogin(sessionId);
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || processingHttpError(res.status, "Analysis"));
      }

      const analysis = await res.json();
      const statuses = analysis.agentStatuses as SpecialistStatus[] | undefined;
      const stageByAgent = { AcademicAuditor: "feasibility", IndustryAnalyst: "laborMarket", FeasibilityStrategist: "jobDemand" } as const;
      markStages([
        ...(statuses ?? []).filter((s) => s.status === "SUCCESS").map((s) => stageByAgent[s.agent]), "synthesis",
      ], statuses, analysis.rankedRecommendations.recommendations.some((r: { rank: number | null }) => r.rank === null));

      if (!signal.aborted) await generateReport(analysis.runId, signal);
    } catch (err) {
      if (signal.aborted) return;
      setState({
        phase: "error",
        message: err instanceof TypeError && /fetch|network/i.test(err.message)
          ? processingHttpError(503, "Analysis")
          : err instanceof Error ? err.message : "Analysis failed",
      });
    }
  }, [generateReport, router, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      router.push("/");
      return;
    }

    if (hasRun.current) return;
    hasRun.current = true;

    runPipeline();
    return () => {
      recoveryRequest.current?.abort();
      hasRun.current = false;
    };
  }, [runPipeline, sessionId, router]);

  useEffect(() => {
    if (terminating || state.phase !== "reportReady" || !sessionId) return;
    const controller = new AbortController();
    const report = state.report;
    const checkCurrentReport = async () => {
      try {
        const current = await fetchSessionState(sessionId, controller.signal);
        if (controller.signal.aborted) return;
        if (!current || current.currentRunId !== report.runId ||
          current.profileVersion !== report.approvedProfileVersion || current.currentReportVersion !== report.reportVersion ||
          current.reportReviewStatus !== report.reviewStatus) {
          setState({ phase: "error", message: "This report changed or expired. Reload the current report before reviewing or downloading." });
        }
      } catch {
        if (!controller.signal.aborted) setState({ phase: "error", message: "The current report could not be confirmed. Reload before reviewing or downloading." });
      }
    };
    window.addEventListener("focus", checkCurrentReport);
    const timer = window.setInterval(checkCurrentReport, 30_000);
    return () => { controller.abort(); window.removeEventListener("focus", checkCurrentReport); window.clearInterval(timer); };
  }, [state, sessionId, terminating]);

  const reviewReport = async (decision: "approved" | "rejected" | "regenerate" | "correct") => {
    if (terminating || state.phase !== "reportReady" || !sessionId) return;
    const report = state.report;
    recoveryRequest.current?.abort();
    const controller = new AbortController();
    recoveryRequest.current = controller;
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(sessionId)}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ decision, runId: report.runId, profileVersion: report.approvedProfileVersion, reportVersion: report.reportVersion }),
      });
      if (response.status === 401) redirectToLogin(sessionId);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Report review could not be confirmed.");
      if (controller.signal.aborted) return;
      if (decision === "correct") router.push(`/input?session=${encodeURIComponent(sessionId)}&edit=1`);
      else if (decision === "regenerate") await runPipeline(false, body.runId);
      else await generateReport(report.runId!, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      // An ambiguous review may have committed. Reload server state before retry.
      throw error;
    }
  };

  return (
    <main className={`min-h-screen ${state.phase === "processing" ? "bg-[var(--cream)]" : "bg-background"}`}>
      {sessionId && <div className="mx-auto mb-1 flex max-w-6xl justify-end px-4 pt-6">
        <SessionTerminationControl compact sessionId={sessionId} open={terminationOpen} onOpenChange={setTerminationOpen}
          onTerminating={() => { recoveryRequest.current?.abort(); setTerminating(true); }} />
      </div>}
      <div hidden={terminating}>
      <div className={sessionId ? "pb-2" : "pt-6 pb-2"}>
        <SessionProgressIndicator
          sessionId={sessionId}
          fallbackStep={state.phase === "reportReady" ? "report" : "analysis"}
          refreshToken={state.phase === "reportReady" ? `${state.report.reportVersion}-${state.report.reviewStatus}` : state.phase}
          className="max-w-6xl"
        />

      </div>
      {state.phase === "processing" && (
        <LoadingScreen completedStages={state.completedStages} agentStatuses={state.agentStatuses} isPartial={state.isPartial} />
      )}
      {state.phase === "error" && (
        <ErrorView
          message={state.message}
          onRetry={() => {
            hasRun.current = false;
            runPipeline(true);
          }}
          onBack={() => {
            router.push(`/input?session=${encodeURIComponent(sessionId ?? "")}&edit=1`);
          }}
        />
      )}
      {state.phase === "unavailable" && (
        <section className="mx-auto max-w-4xl space-y-4 px-4 py-8">
          <h1 className="text-xl font-semibold">This draft is unavailable</h1>
          <Link className="underline" href="/input">Return to saved drafts</Link>
        </section>
      )}
      {state.phase === "reportReady" && (
        <ReportDownloadView
          key={`${state.report.runId}-${state.report.reportVersion}-${state.report.reviewStatus}`}
          report={state.report}
          onNewSession={onNewSession}
          onReview={reviewReport}
          onReload={() => runPipeline()}
        />
      )}
      </div>
    </main>
  );
}

function getReportGenerationErrorMessage(
    status: number,
    responseBody: unknown,
): string {
    const errorMessage =
        isReportErrorBody(responseBody) && responseBody.error.trim()
            ? responseBody.error
            : processingHttpError(status, "Report generation");

    if (status === 422) {
        const detailCount =
            isReportErrorBody(responseBody) && Array.isArray(responseBody.details)
                ? responseBody.details.length
                : 0;

        return detailCount > 0
            ? `${errorMessage} ${detailCount} report input issue${detailCount === 1 ? "" : "s"} must be resolved before the PDF can be generated.`
            : errorMessage;
    }

    if (/bucket not found/i.test(errorMessage)) {
        return "The report storage bucket is not configured yet. Ask the project administrator to create the private kumpas-reports bucket, then try again.";
    }

    return errorMessage;
}

async function fetchSessionState(
  sessionId: string,
  signal: AbortSignal,
): Promise<SessionStateResponse | null> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    { signal, cache: "no-store" },
  );
  if (response.status === 404) return null;

  if (!response.ok) {
    if (response.status === 401) {
      redirectToLogin(sessionId);
    }
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error ?? "Failed to resume session state.");
  }

  return (await response.json()) as SessionStateResponse;
}

function redirectToLogin(sessionId: string) {
  const next = `/analysis?session=${encodeURIComponent(sessionId)}`;
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
}

function isReportErrorBody(
    value: unknown,
): value is { error: string; details?: unknown[] } {
    return (
        typeof value === "object" &&
        value !== null &&
        "error" in value &&
        typeof (value as { error?: unknown }).error === "string"
    );
}

export default function Page() {
  return (
    <>
      <ProtectedHeader />
      <Suspense
        fallback={
          <main className="flex min-h-[60vh] items-center justify-center bg-background">
            <Loader2 size={24} className="animate-spin text-muted-text" />
          </main>
        }
      >
        <AnalysisContent />
      </Suspense>
    </>
  );
}

"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import LoadingScreen from "@/components/analysis/loading-screen";
import ProtectedHeader from "@/components/auth/protected-header";

import type { StageName } from "@/lib/analysis-types";
import type { ReportGenerationResponse } from "@/lib/report/types";

import ErrorView from "@/components/analysis/error-view";
import ReportDownloadView from "@/components/analysis/report-download-view";

type AnalysisPageState =
  | { phase: "processing"; completedStages: StageName[] }
  | { phase: "reportReady"; report: ReportGenerationResponse }
  | { phase: "error"; message: string };

interface SessionStateResponse {
  sessionId: string;
  nextStep: "input" | "analysis" | "report" | "complete" | "start-new-session";
  hasApprovedProfile: boolean;
  hasRecommendations: boolean;
  reportStatus: "not_started" | "generating" | "ready" | "downloaded" | "failed";
}

function AnalysisContent() {
  const [state, setState] = useState<AnalysisPageState>({
    phase: "processing",
    completedStages: [],
  });
  const hasRun = useRef(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session");

  const onNewSession = useCallback(async () => {
    if (sessionId) {
      try {
        const response = await fetch(
          `/api/sessions/${encodeURIComponent(sessionId)}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          console.warn(
            "[analysis] Session cleanup failed.",
            errorBody?.error ?? response.statusText,
          );
        }
      } catch (error) {
        console.warn("[analysis] Session cleanup failed.", error);
      }
    }
    router.push("/input");
  }, [router, sessionId]);

  const onReportDownloadStart = useCallback(async () => {
    if (!sessionId) return;
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/complete`,
      { method: "POST" },
    );
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(
        errorBody?.error ?? "Failed to mark report download complete.",
      );
    }
  }, [sessionId]);

  const generateReport = useCallback(async () => {
    if (!sessionId) {
      throw new Error("No session ID found. Please start a new session.");
    }

    const reportRes = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const reportBody = await reportRes.json();

    if (!reportRes.ok) {
      throw new Error(
        getReportGenerationErrorMessage(reportRes.status, reportBody),
      );
    }

    setState({ phase: "reportReady", report: reportBody });
  }, [sessionId]);

  const runPipeline = useCallback(async () => {
    if (!sessionId) {
      setState({ phase: "error", message: "No session ID found. Please start a new session." });
      return;
    }

    setState({ phase: "processing", completedStages: [] });

    const markStages = (stages: StageName[]) => {
      setState({ phase: "processing", completedStages: stages });
    };

    markStages(["documentParsing"]);
    await new Promise((r) => setTimeout(r, 400));
    markStages(["documentParsing", "notesParsing"]);
    await new Promise((r) => setTimeout(r, 400));
    markStages(["documentParsing", "notesParsing", "transcriptionLayer"]);

    try {
      const sessionState = await fetchSessionState(sessionId);

      if (sessionState.nextStep === "start-new-session") {
        setState({
          phase: "error",
          message: "This session has expired. Please start a new session.",
        });
        return;
      }

      if (sessionState.nextStep === "input" || !sessionState.hasApprovedProfile) {
        router.replace(`/input?session=${encodeURIComponent(sessionId)}`);
        return;
      }

      if (sessionState.reportStatus === "downloaded") {
        setState({
          phase: "error",
          message: "This session has already been completed. Start a new session for the next student.",
        });
        return;
      }

      if (sessionState.hasRecommendations || sessionState.nextStep === "report") {
        await generateReport();
        return;
      }

      const res = await fetch(`/api/sessions/${sessionId}/analyze`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Analysis failed (${res.status})`);
      }

      markStages([
        "documentParsing", "notesParsing", "transcriptionLayer",
        "feasibility", "laborMarket", "jobDemand",
      ]);
      await new Promise((r) => setTimeout(r, 500));

      markStages([
        "documentParsing", "notesParsing", "transcriptionLayer",
        "feasibility", "laborMarket", "jobDemand", "synthesis",
      ]);
      await new Promise((r) => setTimeout(r, 600));

      await generateReport();
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Analysis failed",
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
  }, [runPipeline, sessionId, router]);

  return (
    <main className="min-h-screen bg-background">
      {state.phase === "processing" && (
        <LoadingScreen completedStages={state.completedStages} />
      )}
      {state.phase === "error" && (
        <ErrorView
          message={state.message}
          onRetry={() => {
            hasRun.current = false;
            runPipeline();
          }}
          onBack={() => router.push("/")}
        />
      )}
      {state.phase === "reportReady" && (
        <ReportDownloadView
          report={state.report}
          onNewSession={onNewSession}
          onReportDownloadStart={onReportDownloadStart}
        />
      )}
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
            : "Report generation failed.";

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
): Promise<SessionStateResponse> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error ?? "Failed to resume session state.");
  }

  return (await response.json()) as SessionStateResponse;
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

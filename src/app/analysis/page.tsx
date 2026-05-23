"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import LoadingScreen from "@/components/analysis/loading-screen";
import ErrorView from "@/components/analysis/error-view";

import type { StageName } from "@/lib/analysis-types";

type AnalysisPageState =
  | { phase: "processing"; completedStages: StageName[] }
  | { phase: "error"; message: string };

function AnalysisContent() {
  const [state, setState] = useState<AnalysisPageState>({
    phase: "processing",
    completedStages: [],
  });
  const hasRun = useRef(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session");

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

      router.push(`/report?session=${sessionId}`);
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Analysis failed",
      });
    }
  }, [sessionId, router]);

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
    </main>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[60vh] items-center justify-center bg-background">
          <Loader2 size={24} className="animate-spin text-muted-text" />
        </main>
      }
    >
      <AnalysisContent />
    </Suspense>
  );
}

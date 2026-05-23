"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import LoadingScreen from "@/components/analysis/loading-screen";

import type {
    AnalysisState,
    StageName,
} from "@/lib/analysis-types";

import ErrorView from "@/components/analysis/error-view";
import ReportDownloadView from "@/components/analysis/report-download-view";

/**
 * Simulates the multi-stage analysis pipeline for UI demonstration.
 * TODO: Replace with real API calls to new backend when ready.
 */
function AnalysisContent() {
    const [state, setState] = useState<AnalysisState>({
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
                        "[analysis] Session cleanup failed before new session.",
                        errorBody?.error ?? response.statusText,
                    );
                }
            } catch (error) {
                console.warn(
                    "[analysis] Session cleanup failed before new session.",
                    error,
                );
            }
        }

        router.push("/input");
    }, [router, sessionId]);

    const runPipeline = useCallback(async () => {
        if (!sessionId) {
            setState({ phase: "error", message: "No session ID found. Please start a new session." });
            return;
        }

        try {
            setState({ phase: "processing", completedStages: [] });

            // Simulate upstream modules until Module 3 is available.
            const stages: StageName[] = [
                "documentParsing",
                "notesParsing",
                "transcriptionLayer",
                "feasibility",
                "laborMarket",
                "jobDemand",
                "adjacentCareer",
            ];

            for (let i = 0; i < stages.length; i++) {
                await new Promise((r) => setTimeout(r, 600));
                setState((prev) => {
                    if (prev.phase !== "processing") return prev;
                    return {
                        ...prev,
                        completedStages: stages.slice(0, i + 1),
                    };
                });
            }

            const response = await fetch("/api/reports", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ sessionId }),
            });
            const responseBody = await response.json();

            if (!response.ok) {
                throw new Error(responseBody.error ?? "Report generation failed.");
            }

            setState({ phase: "reportReady", report: responseBody });
        } catch (error) {
            setState({
                phase: "error",
                message:
                    error instanceof Error
                        ? error.message
                        : "Report generation failed.",
            });
        }
    }, [sessionId]);

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
                    onRetry={runPipeline}
                    onBack={() => router.push("/")}
                />
            )}
            {state.phase === "reportReady" && (
                <ReportDownloadView report={state.report} onNewSession={onNewSession} />
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

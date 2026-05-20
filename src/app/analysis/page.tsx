"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import LoadingScreen from "@/components/analysis/loading-screen";

import type {
    AnalysisState,
    SessionIntakeOutput,
    AdjacentCareerReport,
    StoredSession,
    RawAgentResponse,
    StageName,
} from "@/lib/analysis-types";

import { STAGE_ORDER } from "@/components/analysis/processing-view";
import ReportView from "@/components/analysis/report-view";
import ErrorView from "@/components/analysis/error-view";

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

    const onNewSession = useCallback(() => {
        router.push("/input");
    }, [router]);

    const runPipeline = useCallback(async () => {
        if (!sessionId) {
            setState({ phase: "error", message: "No session ID found. Please start a new session." });
            return;
        }

        setState({ phase: "processing", completedStages: [] });

        // Simulate the pipeline stages with delays for UI demonstration
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

        // After simulation, show informational error
        await new Promise((r) => setTimeout(r, 800));
        setState({
            phase: "error",
            message: "Analysis pipeline not yet connected. Wire up your new backend API routes to enable real analysis.",
        });
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
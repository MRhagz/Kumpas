"use client";

import { CheckCircle2, Clock, FileText, RotateCcw, Sparkles } from "lucide-react";

import PdfDownloadButton from "@/components/analysis/pdf-download-button";
import type { ReportGenerationResponse } from "@/lib/report/types";

interface ReportDownloadViewProps {
  report: ReportGenerationResponse;
  onNewSession: () => void;
}

export default function ReportDownloadView({
  report,
  onNewSession,
}: ReportDownloadViewProps) {
  const expiresAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(report.expiresAt));
  const fileName = `Kumpas_Report_${report.sessionId}.pdf`;

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-4 py-10 sm:px-6">
      <section className="rounded-lg border border-black/10 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sage/10 text-sage">
              <CheckCircle2 size={26} />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-text">
              Module 4 - Report Ready
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Career guidance report generated
            </h1>
          </div>
          <button
            type="button"
            onClick={onNewSession}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-text transition-colors hover:text-ink"
          >
            <RotateCcw size={14} />
            New Session
          </button>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-black/10 bg-background p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-text">
              <FileText size={15} />
              Recommendations
            </div>
            <p className="mt-2 text-2xl font-bold text-ink">
              {report.recommendationCount}
            </p>
          </div>
          <div className="rounded-lg border border-black/10 bg-background p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-text">
              <Clock size={15} />
              Link expires
            </div>
            <p className="mt-2 text-sm font-semibold text-ink">{expiresAt}</p>
          </div>
        </div>

        <div className="mt-7">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-text">
            <Sparkles size={15} />
            Top Career Paths
          </div>
          <div className="grid gap-3">
            {report.recommendations.slice(0, 3).map((recommendation) => (
              <article
                key={recommendation.id}
                className="rounded-lg border border-black/10 bg-white p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-text">
                      Rank {recommendation.rank}
                    </p>
                    <h2 className="mt-1 text-base font-bold text-ink">
                      {recommendation.careerPath}
                    </h2>
                  </div>
                  <p className="text-sm font-bold text-sage">
                    {Math.round(recommendation.alignmentScore * 100)}% alignment
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recommendation.keySignals.slice(0, 3).map((signal) => (
                    <span
                      key={signal}
                      className="rounded-full border border-black/10 bg-background px-2.5 py-1 text-xs font-medium text-muted-text"
                    >
                      {signal}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3 border-t border-black/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-text">
            The signed report link is ready for this counseling session.
          </p>
          <PdfDownloadButton downloadUrl={report.downloadUrl} fileName={fileName} />
        </div>
      </section>
    </div>
  );
}

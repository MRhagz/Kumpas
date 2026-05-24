"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BarChart3,
  CheckCircle2,
  FileText,
  FileWarning,
  Minus,
  RotateCcw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import PdfDownloadButton from "@/components/analysis/pdf-download-button";
import type {
  KeySignalDetail,
  ReportGenerationResponse,
  ReportRecommendationSummary,
} from "@/lib/report/types";

interface ReportDownloadViewProps {
  report: ReportGenerationResponse;
  onNewSession: () => void | Promise<void>;
  onReportDownloadStart?: () => void | Promise<void>;
}

export default function ReportDownloadView({
  report,
  onNewSession,
  onReportDownloadStart,
}: ReportDownloadViewProps) {
  const [selectedRecommendationId, setSelectedRecommendationId] = useState(
    report.recommendations[0]?.id ?? "",
  );
  const [isStartingNewSession, setIsStartingNewSession] = useState(false);
  const [isDownloadExpired, setIsDownloadExpired] = useState(false);
  const selectedRecommendation = useMemo(
    () =>
      report.recommendations.find(
        (recommendation) => recommendation.id === selectedRecommendationId,
      ) ?? report.recommendations[0],
    [report.recommendations, selectedRecommendationId],
  );

  const expiresAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(report.expiresAt));
  const generatedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(report.generatedAt));
  const fileName = `Kumpas_Report_${report.sessionId}.pdf`;
  const hasMissingDocuments = report.academicEvidence.missingDocuments.length > 0;
  const topCareerPath =
    report.recommendations[0]?.careerPath ?? "Career Recommendations";

  useEffect(() => {
    const updateExpiryState = () => {
      setIsDownloadExpired(Date.now() >= new Date(report.expiresAt).getTime());
    };

    updateExpiryState();

    const intervalId = window.setInterval(updateExpiryState, 30_000);

    return () => window.clearInterval(intervalId);
  }, [report.expiresAt]);

  const handleNewSession = async () => {
    if (isStartingNewSession) {
      return;
    }

    setIsStartingNewSession(true);

    try {
      await onNewSession();
    } finally {
      setIsStartingNewSession(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-text">
          Career Assessment - Session Output
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Assessment for{" "}
              <span className="text-forest">{topCareerPath}</span>
            </h1>
            <p className="mt-2 text-sm text-muted-text">
              Ranked career recommendations with academic evidence and a
              signed PDF report.
            </p>
          </div>
          <button
            type="button"
            onClick={handleNewSession}
            disabled={isStartingNewSession}
            aria-busy={isStartingNewSession}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-text transition-colors hover:text-ink disabled:cursor-wait disabled:opacity-70"
          >
            <RotateCcw size={14} />
            {isStartingNewSession ? "Starting..." : "New Session"}
          </button>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {report.recommendations.slice(0, 2).map((recommendation) => (
              <RecommendationCard
                key={recommendation.id}
                recommendation={recommendation}
                isSelected={recommendation.id === selectedRecommendation?.id}
                onSelect={() => setSelectedRecommendationId(recommendation.id)}
              />
            ))}
          </div>

          {selectedRecommendation ? (
            <RecommendationDetail recommendation={selectedRecommendation} />
          ) : (
            <div className="rounded-lg border border-black/10 bg-white p-5 shadow-card">
              <p className="text-sm font-semibold text-ink">
                No recommendation is available yet.
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          {report.recommendations[2] ? (
            <RecommendationCard
              recommendation={report.recommendations[2]}
              isSelected={
                report.recommendations[2].id === selectedRecommendation?.id
              }
              onSelect={() =>
                setSelectedRecommendationId(report.recommendations[2].id)
              }
            />
          ) : null}

          <AcademicEvidencePanel
            hasMissingDocuments={hasMissingDocuments}
            availableDocuments={report.academicEvidence.availableDocuments}
            missingDocuments={report.academicEvidence.missingDocuments}
            completenessNote={report.academicEvidence.completenessNote}
          />

          <section className="rounded-lg bg-ink p-5 text-white shadow-card">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              <CheckCircle2 size={15} />
              Report Ready
            </div>
            <h2 className="mt-3 text-lg font-bold">
              Download the counselor report
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              {isDownloadExpired
                ? "This signed report link has expired. Generate the report again to download a fresh copy."
                : "The signed report link opens in a new tab so this analysis page stays available."}
            </p>
            <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
              <MetadataRow label="Generated" value={generatedAt} />
              <MetadataRow label="Expires" value={expiresAt} />
              <MetadataRow
                label="Careers"
                value={String(report.recommendationCount)}
              />
            </div>
            <div className="mt-5">
              <PdfDownloadButton
                downloadUrl={report.downloadUrl}
                fileName={fileName}
                disabled={isDownloadExpired}
                onDownloadStart={onReportDownloadStart}
              />
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

interface RecommendationCardProps {
  recommendation: ReportRecommendationSummary;
  isSelected: boolean;
  onSelect: () => void;
}

function RecommendationCard({
  recommendation,
  isSelected,
  onSelect,
}: RecommendationCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg p-4 text-left shadow-card transition-colors ${
        isSelected
          ? "bg-ink text-white ring-2 ring-forest/30"
          : "border border-black/10 bg-white text-ink hover:border-forest/40"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className={`text-[10px] font-semibold uppercase tracking-widest ${
            isSelected ? "text-white/70" : "text-muted-text"
          }`}
        >
          Rank {recommendation.rank}
        </p>
        <BarChart3
          size={16}
          className={isSelected ? "text-white/70" : "text-muted-text"}
        />
      </div>
      <p className="mt-3 text-3xl font-bold">
        {formatScore(recommendation.alignmentScore)}
      </p>
      <h2
        className={`mt-2 text-base font-bold ${
          isSelected ? "text-forest-light" : "text-ink"
        }`}
      >
        {recommendation.careerPath}
      </h2>
      <p
        className={`mt-1 text-xs ${
          isSelected ? "text-white/60" : "text-muted-text"
        }`}
      >
        {getRecommendationSubtitle(recommendation)}
      </p>
    </button>
  );
}

function RecommendationDetail({
  recommendation,
}: {
  recommendation: ReportRecommendationSummary;
}) {
  return (
    <section className="rounded-lg border border-black/10 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-forest/40 text-xl font-bold text-ink">
            {Math.round(recommendation.alignmentScore * 100)}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-text">
              Selected Recommendation
            </p>
            <h2 className="mt-1 text-2xl font-bold text-ink">
              {recommendation.careerPath}
            </h2>
            <p className="mt-1 text-sm font-semibold text-forest">
              {formatScore(recommendation.alignmentScore)} alignment
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-text">
          Key Signals
        </p>
        {recommendation.keySignalDetails.length > 0 ? (
          <div className="space-y-4">
            {recommendation.keySignalDetails.map((signal, index) => (
              <KeySignalRow
                key={`${signal.label}-${index}`}
                signal={signal}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-black/10 bg-background px-4 py-3 text-sm text-muted-text">
            No key signals were returned for this recommendation.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-lg bg-forest/[0.06] px-4 py-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-forest">
          What This Means
        </p>
        <p className="text-sm leading-relaxed text-ink text-justify">
          {recommendation.reasoningSummary.trim().length > 0
            ? recommendation.reasoningSummary
            : "A detailed reasoning summary is not available for this recommendation. Review the alignment score, key signals, and source references before presenting it to the student."}
        </p>
      </div>
    </section>
  );
}

function KeySignalRow({ signal }: { signal: KeySignalDetail }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:gap-4">
      <div className="flex items-start gap-2">
        <SignalIcon polarity={signal.polarity} />
        <p className="text-sm font-semibold text-ink">{signal.label}</p>
      </div>
      <div>
        <p className="text-sm font-bold leading-relaxed text-ink">
          {signal.value}
        </p>
        {signal.subNote ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-text">
            {signal.subNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SignalIcon({ polarity }: { polarity: KeySignalDetail["polarity"] }) {
  if (polarity === "positive") {
    return <TrendingUp size={15} className="mt-0.5 shrink-0 text-forest" />;
  }

  if (polarity === "negative") {
    return <TrendingDown size={15} className="mt-0.5 shrink-0 text-red-soft" />;
  }

  return <Minus size={15} className="mt-0.5 shrink-0 text-muted-text" />;
}

interface AcademicEvidencePanelProps {
  hasMissingDocuments: boolean;
  availableDocuments: string[];
  missingDocuments: string[];
  completenessNote: string;
}

function AcademicEvidencePanel({
  hasMissingDocuments,
  availableDocuments,
  missingDocuments,
  completenessNote,
}: AcademicEvidencePanelProps) {
  return (
    <section className="rounded-lg border border-black/10 bg-white p-5 shadow-card">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-text">
        <FileWarning size={15} />
        Academic Evidence
      </div>
      <div className="mt-4 grid gap-3">
        <EvidenceList
          icon={<FileText size={14} />}
          label="Available"
          value={formatAcademicDocuments(availableDocuments)}
          tone="default"
        />
        <EvidenceList
          icon={<FileWarning size={14} />}
          label="Missing"
          value={formatAcademicDocuments(missingDocuments)}
          tone={hasMissingDocuments ? "warning" : "default"}
        />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-text">
        {completenessNote}
      </p>
    </section>
  );
}

function EvidenceList({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "default" | "warning";
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-background p-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-text">
        {icon}
        {label}
      </div>
      <p
        className={`mt-1 text-sm font-semibold ${
          tone === "warning" ? "text-amber-700" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-white/55">{label}</span>
      <span className="text-right font-semibold text-white">{value}</span>
    </div>
  );
}

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function getRecommendationSubtitle(
  recommendation: ReportRecommendationSummary,
): string {
  const topSignals = recommendation.keySignalDetails
    .filter((signal) => signal.polarity === "positive")
    .slice(0, 2)
    .map((signal) => signal.label);

  if (topSignals.length === 0) {
    return "Alignment based on student data and labor-market signals";
  }

  return topSignals.join(" · ");
}

function formatAcademicDocuments(documents: string[]): string {
  if (documents.length === 0) {
    return "None";
  }

  return documents.map(formatAcademicDocument).join(", ");
}

function formatAcademicDocument(document: string): string {
  if (document === "form137") {
    return "Form 137";
  }

  return document.toUpperCase();
}

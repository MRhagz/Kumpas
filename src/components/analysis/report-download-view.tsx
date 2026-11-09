"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  AcademicEvidenceSummary,
  ReportGenerationResponse,
  ReportRecommendationSummary,
  StudentReportSummary,
} from "@/lib/report/types";
import { publicSourceUrl, sourceDate, inputLabel } from "@/lib/report/evidence-summary";

interface ReportDownloadViewProps {
  report: ReportGenerationResponse;
  onNewSession: () => void | Promise<void>;
  onReview?: (decision: "approved" | "rejected" | "regenerate" | "correct") => Promise<void>;
  onReload?: () => void | Promise<void>;
}

export default function ReportDownloadView({
  report,
  onNewSession,
  onReview,
  onReload,
}: ReportDownloadViewProps) {
  const [selectedRecommendationId, setSelectedRecommendationId] = useState(
    report.recommendations[0]?.id ?? "",
  );
  const [isDownloadExpired, setIsDownloadExpired] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewLocked, setReviewLocked] = useState(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const reviewDisabled = reviewBusy || reviewLocked || isDownloadExpired || !report.runId || !onReview;
  const isApproved = report.reviewStatus === "approved";
  useEffect(() => {
    if (report.reviewStatus === "approved" || report.reviewStatus === "rejected") reviewHeading.current?.focus();
  }, [report.reviewStatus]);
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
  const fileName = `Kumpas_Report_${report.sessionId}_v${report.reportVersion}.pdf`;
  const hasMissingDocuments = report.academicEvidence.missingDocuments.length > 0;

  useEffect(() => {
    const updateExpiryState = () => {
      setIsDownloadExpired(Date.now() >= new Date(report.expiresAt).getTime());
    };

    updateExpiryState();

    const intervalId = window.setInterval(updateExpiryState, 30_000);

    return () => window.clearInterval(intervalId);
  }, [report.expiresAt]);

  const decide = async (decision: "approved" | "rejected" | "regenerate" | "correct") => {
    if (reviewDisabled) return;
    reviewHeading.current?.focus();
    setReviewBusy(true);
    try {
      await onReview!(decision);
    } catch (error) {
      setReviewLocked(true);
      setReviewError(error instanceof Error ? error.message : "The review result could not be confirmed. Reload the report.");
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-4 pt-2 pb-6 sm:px-6 sm:pt-3 sm:pb-10">
      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-text">
          Career Assessment - Session Output
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Career guidance report
            </h1>
            <p className="mt-2 text-sm text-muted-text">
              AI-assisted career comparisons with academic evidence and a
              versioned PDF report. Scores compare supported options; they are not probabilities of career success.
            </p>
            <p className="mt-2 text-sm text-muted-text">
              Report version: {report.reportVersion}. Approved profile version: {report.approvedProfileVersion ?? "unavailable"}.
              {" "}{isApproved ? "Approved report" : report.reviewStatus === "rejected" ? "Rejected report — final release blocked" : "Draft report — counselor review required"}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { void onNewSession(); }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-text transition-colors hover:text-ink disabled:cursor-wait disabled:opacity-70"
          >
            <RotateCcw size={14} />
            New Session
          </button>
        </div>
      </header>

      <section aria-labelledby="report-review-heading" aria-busy={reviewBusy} className="mb-6 space-y-3 rounded-lg border border-black/10 bg-white p-5 shadow-card">
        <h2 ref={reviewHeading} tabIndex={-1} id="report-review-heading" className="text-lg font-semibold">Counselor review</h2>
        <p className="text-sm">Review the student summary, counselor evidence and exact PDF before approving report version {report.reportVersion} for profile version {report.approvedProfileVersion ?? "unavailable"}. Recommendations are advisory; you remain responsible for final guidance.</p>
        <p className="text-sm">The PDF retains its Draft origin marking after approval. Approval is recorded separately and does not change its content or expiry.</p>
        {report.reviewedAt && <p className="text-sm">{isApproved ? "Approved" : "Rejected"} by the owning counselor on {new Date(report.reviewedAt).toLocaleString()}.</p>}
        {report.reviewStatus === "rejected" && <p role="status" className="text-sm">This version was rejected. Correct inputs or regenerate, then review the new draft.</p>}
        {reviewError && <p role="alert" className="text-sm text-red-700">{reviewError}</p>}
        {reviewBusy && <p role="status" className="text-sm">Confirming report action…</p>}
        <div className="flex flex-wrap gap-3 text-sm">
          {report.previewUrl && !reviewLocked && !isDownloadExpired && <a href={report.previewUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-4 py-2 underline">Preview Draft PDF</a>}
          {isApproved && report.downloadUrl && !reviewLocked && !isDownloadExpired && <a href={report.downloadUrl.replace("&download=1", "")} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-4 py-2 underline">Open approved PDF / Print</a>}
          {report.reviewStatus === "draft" && <>
            <button type="button" disabled={reviewDisabled || !report.previewUrl} onClick={() => void decide("approved")} className="rounded-lg bg-forest px-4 py-2 text-white disabled:opacity-50">Approve report v{report.reportVersion}</button>
            <button type="button" disabled={reviewDisabled} onClick={() => void decide("rejected")} className="rounded-lg border px-4 py-2 disabled:opacity-50">Reject report</button>
          </>}
          <button type="button" disabled={reviewDisabled} onClick={() => void decide("correct")} className="rounded-lg border px-4 py-2 disabled:opacity-50">Correct Inputs</button>
          <button type="button" disabled={reviewDisabled} onClick={() => void decide("regenerate")} className="rounded-lg border px-4 py-2 disabled:opacity-50">Regenerate report</button>
          {reviewLocked && <button type="button" onClick={() => void onReload?.()} className="rounded-lg border px-4 py-2">Reload current report</button>}
        </div>
      </section>

      {report.studentSummary ? <StudentSummaryView summary={report.studentSummary} /> : (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          Student summary unavailable for this stored PDF. Return to Confirm Information and regenerate a current report before using the new report layout.
        </p>
      )}

      {report.agentStatuses?.some((s) => s.status !== "SUCCESS") && (
        <section role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <h2 className="font-semibold">Partial specialist analysis</h2>
          <p>Some analysis is unavailable. Missing dimensions remain unscored. Review or correct the confirmed inputs to run analysis again.</p>
          <ul>
            {report.agentStatuses.map((s) => <li key={s.agent}>{s.agent}: {s.status === "SUCCESS" ? "Complete" : s.status === "FAILED" ? "Failed" : "Unavailable"}</li>)}
          </ul>
        </section>
      )}
      <details open className="mb-6">
        <summary className="mb-5 cursor-pointer rounded-lg border border-black/10 bg-white p-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
          <h2 className="inline text-lg">Counselor detail</h2>
        </summary>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {report.recommendations.filter((r) => r.rank !== null).map((recommendation) => (
          <RecommendationCard
            key={recommendation.id}
            recommendation={recommendation}
            isSelected={recommendation.id === selectedRecommendation?.id}
            onSelect={() => setSelectedRecommendationId(recommendation.id)}
          />
        ))}
      </div>

      {report.recommendations.some((r) => r.rank === null) && (
        <section className="mb-5">
          <h2 className="mb-3 text-lg font-semibold">Unscored partial comparisons</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {report.recommendations.filter((r) => r.rank === null).map((recommendation) => (
              <RecommendationCard key={recommendation.id} recommendation={recommendation}
                isSelected={recommendation.id === selectedRecommendation?.id}
                onSelect={() => setSelectedRecommendationId(recommendation.id)} />
            ))}
          </div>
        </section>
      )}
      {report.recommendations.filter((r) => r.rank !== null).length < 3 && (
        <p className="mb-5 text-sm text-muted-text">Fewer than three scored paths are supported by the available evidence. Missing components remain unscored.</p>
      )}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
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
          <AcademicEvidencePanel
            hasMissingDocuments={hasMissingDocuments}
            availableDocuments={report.academicEvidence.availableDocuments}
            missingDocuments={report.academicEvidence.missingDocuments}
            completenessNote={report.academicEvidence.completenessNote}
            documentStatuses={report.academicEvidence.documentStatuses}
          />

          <section className="rounded-lg bg-ink p-5 text-white shadow-card">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              <CheckCircle2 size={15} />
              {report.downloadUrl ? "Approved report" : "Draft report"}
            </div>
            <h2 className="mt-3 text-lg font-bold">
              {report.downloadUrl ? "Download the counselor report" : "Review the counselor report"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              {isDownloadExpired
                ? "This report has expired. Start a new session to generate a report."
                : report.downloadUrl
                  ? "The report opens in a new tab. Save the approved copy using your school’s process."
                  : "Final download is available after this report version is approved."}
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
              {isApproved && report.downloadUrl && <PdfDownloadButton
                downloadUrl={report.downloadUrl}
                fileName={fileName}
                disabled={isDownloadExpired || reviewLocked || reviewBusy}
              />}
            </div>
          </section>
        </aside>
      </section>
      </details>

    </div>
  );
}

function StudentSummaryView({ summary }: { summary: StudentReportSummary }) {
  return (
    <section aria-labelledby="student-summary-heading" className="mb-6 space-y-4 rounded-lg border border-black/10 bg-white p-5 shadow-card sm:p-6">
      <h2 id="student-summary-heading" className="text-2xl font-bold text-ink">Student summary</h2>
      <div className="space-y-2 rounded-lg bg-forest/[0.06] p-4">
        <h3 className="text-lg font-semibold text-forest">{summary.takeaway}</h3>
        {summary.findings.map((finding) => <p key={finding} className="text-sm">{finding}</p>)}
      </div>
      <p className="text-sm leading-relaxed">{summary.disclosure}</p>
      <p className="text-sm text-muted-text">{summary.scope}</p>
      <p className="text-sm leading-relaxed">{summary.scoreExplanation}</p>
      {summary.options.map((option) => (
        <article key={option.id} className="space-y-2 border-t border-black/10 pt-4">
          <h3 className="break-words text-lg font-semibold text-forest">{option.careerPath}</h3>
          <p className="text-sm">{option.rank === null ? "Unscored option: no total or rank because evidence is missing." : `Rank ${option.rank}. Alignment score: ${option.alignmentScore?.toFixed(2)} out of 100.`}</p>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            {option.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          {option.considerations.map((consideration) => <p key={consideration} className="text-sm text-muted-text">{consideration}</p>)}
        </article>
      ))}
      <h3 className="font-semibold">Uncertainty and missing information</h3>
      <ul className="list-disc space-y-2 pl-5 text-sm">
        {summary.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
      <h3 className="font-semibold">Next steps</h3>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
        {summary.nextSteps.map((step) => <li key={step}>{step}</li>)}
      </ol>
    </section>
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
      className={`min-w-0 rounded-lg p-4 text-left shadow-card transition-colors ${
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
          {recommendation.rank === null ? "Unscored partial comparison" : `Rank ${recommendation.rank}`}
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
        className={`mt-2 text-base font-bold [overflow-wrap:anywhere] ${
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
    <section className="min-w-0 rounded-lg border border-black/10 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-16 min-w-24 shrink-0 items-center justify-center rounded-lg border-2 border-forest/40 px-2 text-base font-bold text-ink">
            {formatScore(recommendation.alignmentScore)}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-text">
              Selected Recommendation
            </p>
            <h2 className="mt-1 text-2xl font-bold text-ink [overflow-wrap:anywhere]">
              {recommendation.careerPath}
            </h2>
            <p className="mt-1 text-sm font-semibold text-forest">
              {formatScore(recommendation.alignmentScore)} alignment
            </p>
          </div>
        </div>
      </div>

      {recommendation.incompleteReason && (
        <p className="mt-4 text-sm text-amber-800">{recommendation.incompleteReason}</p>
      )}
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

      <div className="mt-6 rounded-lg bg-forest/[0.06] px-4 py-3 [overflow-wrap:anywhere]">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-forest">
          What This Means
        </p>
        <p className="text-sm leading-relaxed text-ink text-justify">
          {recommendation.reasoningSummary.trim().length > 0
            ? recommendation.reasoningSummary
            : "Evidence summary unavailable. Review the approved inputs and sources with the counselor."}
        </p>
        {recommendation.evidenceClaims?.map((claim) => (
          <div key={claim.dimension} className="mt-3 text-xs">
            <p>{claim.dimension}: {claim.inputReferences.map(inputLabel).join(", ") || "public source evidence"}</p>
            {claim.sourceReferences.map((ref) => <p key={`${ref.reference}:${ref.chunkIndex}`}>Supporting reference: {ref.reference}, chunk {ref.chunkIndex}</p>)}
          </div>
        ))}
        {!!recommendation.sources?.length && <p className="mt-3 text-xs">Source currency is unverified. Check for outdated or superseding evidence.</p>}
        {recommendation.sources?.map((source, index) => {
          const url = publicSourceUrl(source.sourceUrl) ?? publicSourceUrl(source.reference);
          return <div key={source.id} className="mt-3 break-words text-xs">
            <p>[{index + 1}] {source.title}</p>
            {url ? <a href={url} target="_blank" rel="noreferrer" className="underline">{url}</a> : <p>Source URL unavailable: {source.reference}</p>}
            <p>{sourceDate(source.publicationDate) ? `Publication date: ${source.publicationDate}` : "Publication date unavailable"}</p>
            <p>{sourceDate(source.ingestionTimestamp) ? `Ingestion date: ${source.ingestionTimestamp}` : "Ingestion date unavailable"}</p>
            <p>Acquisition: {source.acquisitionMethod}</p>
          </div>;
        })}
      </div>
    </section>
  );
}

function KeySignalRow({ signal }: { signal: KeySignalDetail }) {
  return (
    <div className="grid gap-2 [overflow-wrap:anywhere] sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
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
  documentStatuses?: AcademicEvidenceSummary["documentStatuses"];
}

function AcademicEvidencePanel({
  hasMissingDocuments,
  availableDocuments,
  missingDocuments,
  completenessNote,
  documentStatuses,
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
      {documentStatuses && <ul className="mt-3 space-y-1 text-sm text-muted-text">
        {Object.entries(documentStatuses).map(([document, status]) => <li key={document}>{formatAcademicDocument(document)}: {status}</li>)}
      </ul>}
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
          tone === "warning" ? "text-amber-800" : "text-ink"
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

function formatScore(score: number | null): string {
  return score === null ? "Unscored" : `${score.toFixed(2)}/100`;
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

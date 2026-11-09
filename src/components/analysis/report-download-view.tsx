"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  AlertCircle,
  ChevronRight,
  CircleX,
  FileSearch,
  Printer,
  RefreshCw,
  SquarePen,
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
} from "@/lib/report/types";
import StudentSummaryView from "./report-student-summary";
import ReportEvidenceDetail from "./report-evidence-detail";
import ReportScore from "./report-score";

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
          Career Assessment · Review report
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Career guidance report
            </h1>
            <p className="mt-2 text-sm text-muted-text">
              {isApproved ? "This report has been approved for release." : report.reviewStatus === "rejected" ? "Create a new draft to continue with counselor review." : "Review the options and evidence, then approve this version for release."}
            </p>
            <p className="mt-2 text-sm text-muted-text">
              Report version: {report.reportVersion}. Approved profile version: {report.approvedProfileVersion ?? "unavailable"}.
              <span className={`ml-2 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${isApproved ? "bg-forest/10 text-forest" : report.reviewStatus === "rejected" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>{isApproved ? "Approved" : report.reviewStatus === "rejected" ? "Rejected · Release blocked" : "Draft · Review required"}</span>
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

      {isDownloadExpired && <p role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This report has expired. Preview, approval and download are unavailable. Start a new session to generate a report.</p>}
      <nav aria-label="Report sections" className="mb-6 flex flex-wrap gap-2 text-sm">
        {[ ["student-summary", "Student summary"], ["counselor-detail", "Counselor evidence"], ["report-review", "Review & release"] ].map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-2 font-medium text-forest hover:bg-forest/5">{label}<ChevronRight size={14} aria-hidden="true" /></a>)}
      </nav>

      {report.studentSummary ? <StudentSummaryView summary={report.studentSummary} /> : (
        <p id="student-summary" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          Student summary unavailable for this stored PDF. Return to Confirm Information and regenerate a current report before using the new report layout. AI-assisted scores compare supported options; they are not probabilities of career success.
        </p>
      )}

      {report.agentStatuses?.some((s) => s.status !== "SUCCESS") && (
        <section role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <h2 className="font-semibold">Partial specialist analysis</h2>
          <p>Some analysis is unavailable. Missing dimensions remain unscored. Review or correct the confirmed inputs to run analysis again.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {report.agentStatuses.map((s) => <li className="rounded-lg border border-amber-200 p-2" key={s.agent}>{{ AcademicAuditor: "Academic analysis", IndustryAnalyst: "Work opportunities", FeasibilityStrategist: "Practical requirements" }[s.agent]}: {s.status === "SUCCESS" ? "Complete" : s.status === "FAILED" ? "Failed" : "Unavailable"}</li>)}
          </ul>
        </section>
      )}
      <section id="counselor-detail" tabIndex={-1} aria-labelledby="counselor-detail-heading" className="mb-8 scroll-mt-32">
        <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-text">For counselor review</p><h2 id="counselor-detail-heading" className="mt-1 font-heading text-2xl font-bold text-ink">Counselor detail</h2><p className="mt-2 text-sm text-muted-text">Select a path to inspect its findings and supporting sources.</p></div>
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

      {selectedRecommendation && <div className="mb-4 flex justify-end">
        <p id="selected-path-announcement" aria-live="polite" aria-atomic="true" className="sr-only">Showing evidence for {selectedRecommendation.careerPath}.</p>
        <a href="#selected-recommendation" aria-describedby="selected-path-announcement" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-forest underline underline-offset-4">View selected path details<ChevronRight size={15} aria-hidden="true" /></a>
      </div>}
      <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <aside className="lg:sticky lg:top-24 lg:order-last">
          <AcademicEvidencePanel evidence={report.academicEvidence} />
        </aside>
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

      </section>
      </section>

      <div id="report-review" tabIndex={-1} className="grid scroll-mt-32 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-labelledby="report-review-heading" aria-busy={reviewBusy} className="mb-6 space-y-3 rounded-lg border border-black/10 bg-white p-5 shadow-card">
        <h2 ref={reviewHeading} tabIndex={-1} id="report-review-heading" className="text-lg font-semibold">Counselor review</h2>
        <ol className="grid gap-2 text-sm text-muted-text sm:grid-cols-3">{["Compare student options", "Check evidence & sources", "Preview the exact PDF"].map((step, index) => <li key={step} className="rounded-lg bg-background p-3"><span className="mb-1 block text-xs font-bold text-forest">0{index + 1}</span>{step}</li>)}</ol>
        <p className="text-sm text-muted-text">Approving releases report v{report.reportVersion} for profile {report.approvedProfileVersion ? `v${report.approvedProfileVersion}` : "version unavailable"}. Recommendations are advisory; you remain responsible for final guidance.</p>
        <p className="text-xs leading-relaxed text-muted-text">The PDF retains its Draft origin marking after approval. Approval is recorded separately and does not change its content or expiry.</p>
        {report.reviewedAt && <p className="text-sm">{isApproved ? "Approved" : "Rejected"} by the owning counselor on {new Date(report.reviewedAt).toLocaleString()}.</p>}
        {report.reviewStatus === "rejected" && <p role="status" className="text-sm">This version was rejected. Correct inputs or regenerate, then review the new draft.</p>}
        {reviewError && <p role="alert" className="text-sm text-red-700">{reviewError}</p>}
        {reviewBusy && <p role="status" className="text-sm">Confirming report action…</p>}
        <div
          role="group"
          aria-label="Release this report"
          className="flex flex-col gap-3 pt-2 text-sm sm:flex-row sm:flex-wrap"
        >
          {report.reviewStatus === "draft" && (
            <button
              type="button"
              disabled={reviewDisabled || !report.previewUrl}
              onClick={() => void decide("approved")}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-forest bg-forest px-5 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-forest/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              Approve report v{report.reportVersion}
            </button>
          )}
          {report.previewUrl && !reviewLocked && !isDownloadExpired && (
            <a
              href={report.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-forest/40 bg-forest/5 px-4 py-3 font-semibold text-forest transition-colors hover:bg-forest/10"
            >
              <FileSearch size={18} aria-hidden="true" />
              Preview Draft PDF
            </a>
          )}
          {isApproved &&
            report.downloadUrl &&
            !reviewLocked &&
            !isDownloadExpired && (
              <a
                href={report.downloadUrl.replace("&download=1", "")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-forest/40 bg-forest/5 px-4 py-3 font-semibold text-forest transition-colors hover:bg-forest/10"
              >
                <Printer size={18} aria-hidden="true" />
                Open approved PDF / Print
              </a>
            )}
        </div>
        <div
          role="group"
          aria-label="Revise this report"
          className="border-t border-black/10 pt-4"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-text">
            Need to make changes?
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <button
              type="button"
              disabled={reviewDisabled}
              onClick={() => void decide("correct")}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-black/15 bg-white px-4 py-2 font-medium text-ink transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SquarePen size={16} aria-hidden="true" />
              Correct Inputs
            </button>
            <button
              type="button"
              disabled={reviewDisabled}
              onClick={() => void decide("regenerate")}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-black/15 bg-white px-4 py-2 font-medium text-ink transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Regenerate report
            </button>
          </div>
        </div>
        {report.reviewStatus === "draft" && (
          <div
            role="group"
            aria-label="Reject this version"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-red-100 pt-4"
          >
            <p className="text-xs text-muted-text">Block release of this version</p>
            <button
              type="button"
              disabled={reviewDisabled}
              onClick={() => void decide("rejected")}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 transition-colors hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CircleX size={16} aria-hidden="true" />
              Reject report
            </button>
          </div>
        )}
        {reviewLocked && (
          <button
            type="button"
            onClick={() => void onReload?.()}
            className="rounded-lg border border-forest px-4 py-2 text-sm font-semibold text-forest"
          >
            Reload current report
          </button>
        )}

      </section>
          <section aria-label="Report download" className="rounded-lg bg-ink p-5 text-white shadow-card">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              {report.reviewStatus === "rejected" ? <CircleX size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
              {isApproved ? "Approved report" : report.reviewStatus === "rejected" ? "Rejected report" : "Draft report"}
            </div>
            <h2 className="mt-3 text-lg font-bold">
              {isApproved ? "Download the counselor report" : report.reviewStatus === "rejected" ? "Create a new draft" : "Review the counselor report"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              {isDownloadExpired
                ? "This report has expired. Start a new session to generate a report."
                : report.reviewStatus === "rejected"
                  ? "This version cannot be released. Correct the inputs or regenerate the report, then review the new draft."
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
                disabled={reviewLocked || reviewBusy}
                expired={isDownloadExpired}
              />}
            </div>
          </section>
      </div>

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
      aria-pressed={isSelected}
      aria-controls="selected-recommendation"
      className={`min-w-0 rounded-lg border p-4 text-left transition-colors ${isSelected ? "border-forest bg-forest/5 ring-1 ring-forest" : "border-black/10 bg-white hover:border-forest/40"}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-text">
        <span>{recommendation.rank === null ? "Partial comparison" : `Rank ${recommendation.rank}`}</span>
        <span className="text-forest">{isSelected ? "Selected" : "View evidence"}</span>
      </div>
      <h3 className="mt-2 mb-3 sm:min-h-12 text-base font-bold text-ink [overflow-wrap:anywhere]">{recommendation.careerPath}</h3>
      <ReportScore score={recommendation.alignmentScore} label={`${recommendation.careerPath} counselor alignment`} />
    </button>
  );
}

function RecommendationDetail({
  recommendation,
}: {
  recommendation: ReportRecommendationSummary;
}) {
  return (
    <section id="selected-recommendation" tabIndex={-1} aria-label="Selected recommendation" className="min-w-0 scroll-mt-32 rounded-xl border border-black/10 bg-white p-5 shadow-card sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-text">Selected path · Evidence review</p>
      <h3 className="mt-2 text-2xl font-bold text-ink [overflow-wrap:anywhere]">{recommendation.careerPath}</h3>

      {recommendation.incompleteReason && (
        <p className="mt-4 text-sm text-amber-800">{recommendation.incompleteReason}</p>
      )}
      {([ ["positive", "Supporting factors"], ["negative", "Concerns to discuss"], ["neutral", "Other observations"] ] as const).map(([polarity, label]) => {
        const signals = recommendation.keySignalDetails.filter((signal) => signal.polarity === polarity && !recommendation.evidenceClaims?.some((claim) => claim.text === signal.value));
        return signals.length > 0 && <section key={polarity} className="mt-5">
          <h4 className="mb-3 text-sm font-semibold text-ink">{label}</h4>
          <div className="space-y-3">{signals.map((signal, index) => <KeySignalRow key={`${signal.label}-${index}`} signal={signal} />)}</div>
        </section>;
      })}
      <ReportEvidenceDetail recommendation={recommendation} />
      <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-black/10 pt-4 text-sm font-semibold text-forest">
        <a href="#counselor-detail" className="inline-flex min-h-9 items-center rounded-lg px-2 py-1 underline underline-offset-4">Compare paths</a>
        <a href="#report-review" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 py-1 underline underline-offset-4">Continue to review<ChevronRight size={15} aria-hidden="true" /></a>
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

function AcademicEvidencePanel({ evidence }: { evidence: AcademicEvidenceSummary }) {
  const documents = ["form137", "ncae", "nat"] as const;
  const statusLabels = { provided: "Provided", absent: "Not provided", unreadable: "Unreadable", unsupported: "Unsupported" };
  const rows = documents.map((document) => ({ document, status: evidence.documentStatuses?.[document] ?? (evidence.availableDocuments.includes(document) ? "provided" : "absent") }));
  const provided = rows.filter((row) => row.status === "provided").length;
  return (
    <section aria-labelledby="academic-evidence-heading" className="rounded-xl border border-black/10 bg-white p-5 shadow-card">
      <h3 id="academic-evidence-heading" className="flex items-center gap-2 text-base font-semibold text-ink"><FileText size={18} aria-hidden="true" />Academic evidence</h3>
      <p className="mt-2 text-sm text-muted-text"><span className="font-semibold text-ink">{provided} of 3</span> records available</p>
      <ul className="mt-4 divide-y divide-black/10">
        {rows.map(({ document, status }) => <li key={document} className="flex items-center justify-between gap-2 py-3 text-sm">
          <span className="font-semibold text-ink">{formatAcademicDocument(document)}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${status === "provided" ? "bg-forest/10 text-forest" : status === "absent" ? "bg-background text-muted-text" : "bg-amber-50 text-amber-900"}`}>
            {status === "provided" ? <CheckCircle2 size={13} aria-hidden="true" /> : status === "absent" ? <Minus size={13} aria-hidden="true" /> : <AlertCircle size={13} aria-hidden="true" />}{statusLabels[status]}
          </span>
        </li>)}
      </ul>
      {provided < 3 && <p className="mt-3 text-xs leading-relaxed text-amber-900">Unavailable records do not contribute evidence to this comparison.</p>}
      <details className="mt-4 border-t border-black/10 pt-3 text-xs text-muted-text">
        <summary className="min-h-8 cursor-pointer py-1 font-semibold">About evidence coverage</summary>
        <p className="mt-2 leading-relaxed">{evidence.completenessNote}</p>
        <p className="mt-2 leading-relaxed">Form 137: school academic record. NCAE: National Career Assessment Examination. NAT: National Achievement Test.</p>
      </details>
    </section>
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

function formatAcademicDocument(document: string): string {
  if (document === "form137") {
    return "Form 137";
  }

  return document.toUpperCase();
}

import { ArrowRight, Compass, Info } from "lucide-react";
import type { StudentReportSummary } from "@/lib/report/types";
import ReportScore from "./report-score";

export default function StudentSummaryView({
  summary,
}: {
  summary: StudentReportSummary;
}) {
  return (
    <section
      id="student-summary"
      aria-labelledby="student-summary-heading"
      className="mb-8 scroll-mt-6 rounded-xl border border-black/10 bg-white p-5 shadow-card sm:p-6"
    >
      <div className="mb-5 flex items-start gap-3">
        <Compass
          size={22}
          aria-hidden="true"
          className="mt-1 shrink-0 text-forest"
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-text">
            For your conversation with the student
          </p>
          <h2
            id="student-summary-heading"
            className="mt-1 font-heading text-2xl font-bold text-ink"
          >
            Student summary
          </h2>
          <p className="mt-2 text-sm text-muted-text">
            Compare the options, explore the evidence, and agree on next steps
            together.
          </p>
        </div>
      </div>
      <div className="mb-5 flex items-start gap-2 rounded-lg bg-forest/5 p-3 text-sm text-forest">
        <Info size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p>
          AI-generated comparisons support counseling. Scores are points out of
          100, not probabilities of career success.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {summary.options.map((option) => (
          <article
            key={option.id}
            className="min-w-0 rounded-lg border border-black/10 p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-text">
              {option.rank === null
                ? "Partial comparison"
                : `Rank ${option.rank}`}
            </p>
            <h3 className="mt-2 mb-4 break-words md:min-h-14 text-lg font-bold text-ink">
              {option.careerPath}
            </h3>
            <ReportScore
              score={option.alignmentScore}
              label={`${option.careerPath} alignment`}
            />
            <details className="group mt-4 border-t border-black/10 pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-forest">
                Why this option?
              </summary>
              <ul className="mt-3 space-y-3 text-sm leading-relaxed text-muted-text">
                {option.reasons.map((reason) => (
                  <li key={reason} className="border-l-2 border-forest/25 pl-3">
                    {reason}
                  </li>
                ))}
              </ul>
            </details>
            {option.considerations.length > 0 && (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
                <p className="mb-1 font-semibold">Discuss together</p>
                {option.considerations.map((consideration) => (
                  <p key={consideration}>{consideration}</p>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="mt-5 divide-y divide-black/10 rounded-lg border border-black/10">
        <details className="p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">
            How to read these comparisons
          </summary>
          <div className="mt-3 space-y-2 leading-relaxed text-muted-text">
            <p>{summary.disclosure}</p>
            <p>{summary.scoreExplanation}</p>
            <p>{summary.scope}</p>
          </div>
        </details>
        {summary.limitations.length > 0 && (
          <details className="p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-amber-900">
              Limits to discuss{" "}
              <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs">
                {summary.limitations.length}
              </span>
            </summary>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-muted-text">
              {summary.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <h3 className="mt-6 flex items-center gap-2 text-base font-semibold text-ink">
        <ArrowRight size={17} aria-hidden="true" />
        Next steps
      </h3>
      <ol className="mt-3 grid gap-4 md:grid-cols-3">
        {summary.nextSteps.map((step, index) => (
          <li
            key={step}
            className="flex items-start gap-3 rounded-lg bg-background p-3 text-sm leading-relaxed text-ink"
          >
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-forest text-xs font-bold text-white"
            >
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

import { useId } from "react";
import { ExternalLink, BookOpen, CircleHelp } from "lucide-react";
import {
  isAlignmentScore,
  type ReportRecommendationSummary,
} from "@/lib/report/types";
import {
  EVIDENCE_DIMENSIONS,
  inputLabel,
  publicSourceUrl,
  sourceDate,
} from "@/lib/report/evidence-summary";
import ReportScore from "./report-score";

const dimensionLabels = {
  aptitude: "Aptitude fit",
  demand: "Work opportunities",
  feasibility: "Practical requirements",
};

export default function ReportEvidenceDetail({
  recommendation,
}: {
  recommendation: ReportRecommendationSummary;
}) {
  const prefix = useId();
  const sources = recommendation.sources ?? [];
  const claims = recommendation.evidenceClaims ?? [];
  return (
    <div className="mt-6 space-y-6">
      <section aria-label="What this means">
        <h3 className="text-base font-semibold text-ink">What this means</h3>
        <p className="mt-1 text-sm text-muted-text">
          Evidence behind this comparison, organized by dimension.
        </p>
        {claims.length ? (
          <div className="mt-4 space-y-3">
            {EVIDENCE_DIMENSIONS.map((dimension) => {
              const claim = claims.find((item) => item.dimension === dimension);
              const references =
                claim?.sourceReferences
                  .map((ref) =>
                    sources.findIndex(
                      (source) =>
                        source.reference === ref.reference &&
                        source.chunkIndex === ref.chunkIndex &&
                        (ref.siloId === undefined ||
                          ref.siloId === source.siloId),
                    ),
                  )
                  .filter((index) => index >= 0) ?? [];
              return (
                <article
                  key={dimension}
                  className={`rounded-lg border p-4 ${claim ? "border-forest/15 bg-forest/5" : "border-dashed border-amber-200 bg-amber-50"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-ink">
                      {dimensionLabels[dimension]}
                    </h4>
                    <span
                      className={`text-xs font-medium ${claim ? "text-forest" : "text-amber-900"}`}
                    >
                      {claim ? "Evidence available" : "Evidence unavailable"}
                    </span>
                  </div>
                  {isAlignmentScore(claim?.score) && (
                    <div className="mt-3">
                      <ReportScore
                        score={claim.score}
                        label={`${dimensionLabels[dimension]} component`}
                        subtle
                      />
                    </div>
                  )}
                  <p className="mt-3 text-sm leading-relaxed text-muted-text">
                    {claim
                      ? `Based on ${[
                          ...claim.inputReferences.map(inputLabel),
                          ...(claim.sourceReferences.length
                            ? ["cited public evidence"]
                            : []),
                        ].join(" and ")}.`
                      : "No supported comparison is available for this dimension."}
                  </p>
                  {references.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-text">Sources</span>
                      {[...new Set(references)].map((index) => (
                        <a
                          key={index}
                          href={`#${prefix}-source-${index}`}
                          aria-label={`Source ${index + 1}: ${sources[index].title}`}
                          className="rounded border border-forest/20 bg-white px-2 py-1 font-semibold text-forest underline underline-offset-2"
                        >
                          [{index + 1}]
                        </a>
                      ))}
                    </div>
                  )}
                  {claim && (
                    <details className="mt-3 text-xs text-muted-text">
                      <summary className="min-h-8 cursor-pointer py-1 font-medium">
                        Evidence trail
                      </summary>
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        {claim.inputReferences.map((reference) => (
                          <li key={reference}>{inputLabel(reference)}</li>
                        ))}
                        {claim.sourceReferences.map((ref, index) => (
                          <li
                            key={`${ref.reference}-${index}`}
                            className="break-words"
                          >
                            {ref.reference} · excerpt {ref.chunkIndex}
                            {ref.siloId
                              ? ` · ${ref.siloId.replaceAll("_", " ")}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-background p-4 text-sm leading-relaxed text-muted-text">
            {recommendation.reasoningSummary.trim() ||
              "Evidence summary unavailable. Review the approved inputs and sources with the counselor."}
          </p>
        )}
      </section>
      <section
        aria-label="Supporting sources"
        className="border-t border-black/10 pt-5"
      >
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          <BookOpen size={18} aria-hidden="true" />
          Supporting sources{" "}
          <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-text">
            {sources.length}
          </span>
        </h3>
        {sources.length ? (
          <>
            <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-amber-900">
              <CircleHelp
                size={15}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
              Sources may be outdated. Check for newer information before using
              this guidance.
            </p>
            <p id={`${prefix}-new-tab`} className="sr-only">
              Source links open in a new tab.
            </p>
            <ol className="mt-4 space-y-3">
              {sources.map((source, index) => {
                const url =
                  publicSourceUrl(source.sourceUrl) ??
                  publicSourceUrl(source.reference);
                const published = sourceDate(source.publicationDate);
                return (
                  <li
                    key={`${source.id}-${index}`}
                    id={`${prefix}-source-${index}`}
                    tabIndex={-1}
                    className="scroll-mt-32 rounded-lg border border-black/10 p-3 target:ring-2 target:ring-forest/40"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded bg-forest/10 text-xs font-bold text-forest">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-describedby={`${prefix}-new-tab`}
                            className="inline-flex min-h-6 items-start gap-2 text-sm font-semibold text-forest underline decoration-forest/30 underline-offset-4"
                          >
                            {source.title}
                            <ExternalLink
                              size={14}
                              aria-hidden="true"
                              className="mt-0.5 shrink-0"
                            />
                          </a>
                        ) : (
                          <p className="text-sm font-semibold text-ink">
                            {source.title}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-text">
                          {published
                            ? `Published ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(published))}`
                            : "Publication date unavailable"}
                          {!url && " · Public link unavailable"}
                        </p>
                        <details className="mt-2 text-xs text-muted-text">
                          <summary className="min-h-8 cursor-pointer py-1 font-medium">
                            Source details
                          </summary>
                          <dl className="mt-2 space-y-2 break-words">
                            <div>
                              <dt className="font-semibold">Reference</dt>
                              <dd>{source.reference}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold">
                                Added to knowledge base
                              </dt>
                              <dd>
                                {sourceDate(source.ingestionTimestamp)
                                  ? new Date(
                                      source.ingestionTimestamp!,
                                    ).toLocaleDateString()
                                  : "Ingestion date unavailable"}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-semibold">Acquisition</dt>
                              <dd>
                                {source.acquisitionMethod.replaceAll("_", " ")}
                              </dd>
                            </div>
                          </dl>
                        </details>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p className="mt-3 rounded-lg bg-background p-3 text-sm text-muted-text">
            No supporting reference sources are available for this option.
          </p>
        )}
      </section>
    </div>
  );
}

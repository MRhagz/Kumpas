import type { AcademicEvidenceSummary, RankedRecommendationList, RankedRecommendation, StudentReportSummary } from "@/lib/report/types";
import { evidenceClaims, summaryText, type EvidenceClaim } from "./evidence-summary";

export interface FormattedReasoningSummary {
  recommendationId: string;
  careerPath: string;
  summary: string;
  isPlaceholder: boolean;
  concerns: string[];
  claims: EvidenceClaim[];
}

export interface ReasoningSummaryFormatterOptions {
  maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 700;
const PLACEHOLDER_SUMMARY =
  "Evidence summary unavailable. Review the approved inputs and cited sources with the counselor before using this comparison.";

export function formatReasoningSummary(
  recommendation: RankedRecommendation,
  options: ReasoningSummaryFormatterOptions = {},
): FormattedReasoningSummary {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const claims = evidenceClaims({ componentEvidence: recommendation.componentEvidence ?? { aptitude: null, demand: null, feasibility: null },
    aptitudeScore: recommendation.aptitudeFit, demandScore: recommendation.marketDemand, feasibilityScore: recommendation.financialFeasibility,
    sourceReferences: recommendation.sources });
  const normalizedSummary = summaryText(claims);
  const isPlaceholder = !claims.length || recommendation.reasoningSummary !== normalizedSummary;
  const summary = isPlaceholder
    ? PLACEHOLDER_SUMMARY
    : truncateAtSentenceBoundary(normalizedSummary, maxLength);

  return {
    recommendationId: recommendation.id,
    careerPath: recommendation.careerPath,
    summary,
    isPlaceholder,
    concerns: buildConcerns(recommendation),
    claims: isPlaceholder ? [] : claims,
  };
}

export function formatReasoningSummaries(
  recommendations: RankedRecommendation[],
  options: ReasoningSummaryFormatterOptions = {},
): FormattedReasoningSummary[] {
  return recommendations.map((recommendation) =>
    formatReasoningSummary(recommendation, options),
  );
}

/** Student wording uses evidence categories, never note values or model prose. */
export function buildStudentSummary(
  list: RankedRecommendationList,
  evidence: AcademicEvidenceSummary,
): StudentReportSummary {
  const scored = list.recommendations.filter((option) => option.rank !== null && option.alignmentScore !== null);
  const leaders = scored.filter((option) => option.alignmentScore === scored[0]?.alignmentScore);
  const gap = scored.length > 1 ? (scored[0].alignmentScore! - scored[1].alignmentScore!).toFixed(2) : null;
  const takeaway = !scored.length ? "No overall ranking"
    : leaders.length > 1 ? `${leaders.length} pathways share the top score`
    : gap !== null ? `Top two pathways: ${gap} points apart`
    : "One pathway has an overall score";
  const findings = [!scored.length
    ? "Review the evidence gaps with the student. No total or rank can be assigned from the available evidence."
    : leaders.length > 1 ? "The overall score does not separate the leading pathways. Compare their components and your preferences."
    : scored.length > 1 ? `The first-to-last score gap is ${(scored[0].alignmentScore! - scored[scored.length - 1].alignmentScore!).toFixed(2)} points. Use the component comparison to explore the differences.`
    : "There is no other scored pathway to compare with this option."];
  const attention = new Map<string, number>();
  for (const option of scored) {
    const components = supportedComponents(option);
    if (components.length < 2) continue;
    const lowest = Math.min(...components.map(({ score }) => score));
    if (lowest === Math.max(...components.map(({ score }) => score))) continue;
    for (const component of components.filter(({ score }) => score === lowest)) {
      attention.set(component.label, (attention.get(component.label) ?? 0) + 1);
    }
  }
  for (const [label, count] of attention) findings.push(
    `${capitalize(label)} is the lowest supported component in ${count} of ${scored.length} ranked pathways; make it a discussion priority.`,
  );
  const limitations = [
    list.recommendations.some((option) => option.sources.length)
      ? "Source currency is unverified. Ask your counselor to check for newer information."
      : "No supporting reference sources are available. Review this evidence gap with your counselor.",
  ];
  if (evidence.missingDocuments.length) limitations.push(
    `Missing academic evidence: ${evidence.missingDocuments.map(documentLabel).join(", ")}. These records cannot support this comparison.`,
  );
  if (!evidence.availableDocuments.length) limitations.push(
    "No usable academic records are available. Reported interests are not measured academic performance.",
  );
  for (const [document, status] of Object.entries(evidence.documentStatuses ?? {})) {
    if (status === "unreadable" || status === "unsupported") limitations.push(`${documentLabel(document)} was ${status}; it provides no usable evidence.`);
  }
  if (list.recommendations.filter((option) => option.rank !== null).length < 3) limitations.push(
    "Fewer than three scored paths are supported. Missing scores are not zero, and partial options have no total or rank.",
  );
  if (list.agentStatuses?.some((agent) => agent.status !== "SUCCESS")) limitations.push(
    "Some specialist analysis is unavailable. Discuss the missing evidence before deciding.",
  );
  return {
    takeaway,
    findings,
    disclosure: "AI-generated comparisons use counselor-confirmed inputs and available reference sources. They support discussion, not a decision about your future. Your counselor reviews the evidence and helps you decide.",
    scoreExplanation: "Alignment combines aptitude (fit), demand (work opportunities), and feasibility (practical requirements). Scores are points out of 100, not probabilities of career success. Relative strengths describe scores, not confirmed personal strengths; a higher score is not a guarantee.",
    scope: "For Grade 10 and Senior High School (SHS) guidance. Your current education stage is not confirmed by this report.",
    options: list.recommendations.map((option) => {
      const formatted = formatReasoningSummary(option, { maxLength: Number.MAX_SAFE_INTEGER });
      const basis = formatted.claims.map((claim) => {
        if (claim.dimension === "aptitude") {
          const basis = [];
          if (claim.inputReferences.some((ref) => ref.startsWith("academicData."))) basis.push("reviewed academic records");
          if (claim.inputReferences.some((ref) => ref.startsWith("counselorNotes."))) basis.push("reviewed, self-reported interests or goals (not measured academic performance)");
          if (claim.sourceReferences.length) basis.push("cited public records");
          return `aptitude uses ${basis.join(" and ") || "reviewed input references"}`;
        }
        const context = [
          ...(claim.inputReferences.length ? ["reviewed context"] : []),
          ...(claim.sourceReferences.length ? ["cited public evidence"] : []),
        ].join(" and ");
        return `${claim.dimension} uses ${context}${claim.dimension === "feasibility" ? " (personal details withheld)" : ""}`;
      });
      const components = supportedComponents(option);
      const missing = ["aptitude", "demand", "feasibility"].filter((label) => !components.some((component) => component.label === label));
      const scores = components.map(({ score }) => score);
      const lowest = Math.min(...scores), highest = Math.max(...scores);
      const strongest = components.filter(({ score }) => score === highest).map(({ label }) => label);
      const weakest = components.filter(({ score }) => score === lowest);
      const relativeFit = components.length < 2 ? null : lowest === highest
        ? "The supported components have equal scores; they do not distinguish a relative strength."
        : `Highest supported component: ${strongest.join(" and ")}.`;
      return {
        id: option.id, careerPath: option.careerPath, rank: option.rank, alignmentScore: option.alignmentScore,
        reasons: basis.length ? [...(relativeFit ? [relativeFit] : []), `Evidence used: ${basis.join("; ")}.`] : ["Evidence summary unavailable. Ask your counselor to review the inputs and sources before using this option."],
        considerations: [
          ...(missing.length ? [`Evidence unavailable or unverified for ${missing.join(", ")}.${option.rank === null ? " This option is unscored and has no rank." : " Verify the supporting evidence before relying on this ranking."}`] : []),
          ...(lowest < highest ? [
            `Trade-off: ${capitalize(weakest.map(({ label }) => label).join(" and "))} ${weakest.length === 1 ? "scores" : "score"} lower than the other supported components.`,
            `Discuss: ${weakest.map(({ question }) => question).join(" ")}`,
          ] : []),
        ],
      };
    }),
    limitations,
    nextSteps: [
      "Discuss the options, their reasons and missing evidence with your counselor before choosing.",
      "If you are in Grade 10, discuss suitable Senior High School tracks. If you are finishing SHS, discuss further study, training or work options.",
      "Check current entry requirements, costs and financial support with the relevant school or training provider. Review this comparison when missing information becomes available.",
    ],
  };
}

// Compare only components accepted by the evidence formatter. Never turn raw
// model explanations, note values or an unsupported number into a fit claim.
function supportedComponents(option: RankedRecommendation) {
  const claims = formatReasoningSummary(option).claims;
  return [
    { label: "aptitude", score: option.aptitudeFit, question: "Which study or skill requirements should you review?" },
    { label: "demand", score: option.marketDemand, question: "What current local opportunities and entry-level roles should you check?" },
    { label: "feasibility", score: option.financialFeasibility, question: "Which costs, entry requirements or support options need checking?" },
  ].flatMap((component) => component.score !== null && claims.some(({ dimension }) => dimension === component.label)
    ? [{ ...component, score: component.score }] : []);
}

function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}

export function documentLabel(document: string): string {
  return document === "form137" ? "Form 137 (school academic record)"
    : document === "ncae" ? "National Career Assessment Examination (NCAE)"
    : "National Achievement Test (NAT)";
}

function buildConcerns(recommendation: RankedRecommendation): string[] {
  const concerns: string[] = [];

  if (recommendation.status === "degraded") {
    concerns.push(
      recommendation.degradedReason ??
        "This recommendation was generated with partial reasoning coverage.",
    );
  }

  if (recommendation.status === "incomplete") {
    concerns.push(
      recommendation.incompleteReason ??
        "This recommendation is missing at least one contributing analysis output.",
    );
  }

  const missing = [recommendation.aptitudeFit === null ? "aptitude" : "", recommendation.marketDemand === null ? "demand" : "", recommendation.financialFeasibility === null ? "feasibility" : ""].filter(Boolean);
  if (missing.length) concerns.push(`Missing evidence: ${missing.join(", ")}; no total or rank is assigned.`);
  if (recommendation.sources.length) concerns.push("Source currency is unverified. Check for outdated or superseding evidence before using this comparison.");
  return concerns;
}

function truncateAtSentenceBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const truncated = value.slice(0, maxLength).trimEnd();
  const sentenceEnd = Math.max(
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf("?"),
  );

  if (sentenceEnd >= maxLength * 0.6) {
    return truncated.slice(0, sentenceEnd + 1);
  }

  return `${truncated.replace(/[,\s]+$/, "")}...`;
}

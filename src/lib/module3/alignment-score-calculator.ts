import type { IntermediateSynthesis, ScoredCareerPath } from "./types";

export const ALIGNMENT_WEIGHTS = Object.freeze({ aptitude: 0.35, demand: 0.40, feasibility: 0.25 });

export function isComponentScore(score: unknown): score is number {
  return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100;
}

export class InsufficientEvidenceError extends Error {
  constructor() {
    super("Insufficient evidence for a supported career comparison. Retry or End Session.");
  }
}

export class AlignmentScoreCalculator {
  calculate(synthesis: IntermediateSynthesis): ScoredCareerPath[] {
    const scored: ScoredCareerPath[] = synthesis.candidates.map((candidate) => {
      const { aptitudeScore: a, demandScore: d, feasibilityScore: f } = candidate;
      for (const score of [a, d, f]) {
        if (score !== null && !isComponentScore(score)) throw new Error("Invalid component score: expected 0–100 or null.");
      }
      const total = a === null || d === null || f === null ? null : (35 * a + 40 * d + 25 * f) / 100;
      return {
        ...candidate,
        // Correct binary floating-point noise at decimal half boundaries.
        alignmentScore: total === null ? null : Math.round((total + Number.EPSILON * Math.max(1, total)) * 100) / 100,
        rank: null,
      };
    });
    scored.sort((a, b) => {
      if (a.alignmentScore === null && b.alignmentScore !== null) return 1;
      if (b.alignmentScore === null && a.alignmentScore !== null) return -1;
      return (b.alignmentScore ?? 0) - (a.alignmentScore ?? 0) || a.careerPath.localeCompare(b.careerPath, "en");
    });
    scored.forEach((path, index) => {
      if (path.alignmentScore !== null) {
        path.rank = index > 0 && scored[index - 1].alignmentScore === path.alignmentScore ? scored[index - 1].rank : index + 1;
      }
    });
    return scored;
  }
}

export const alignmentScoreCalculator = new AlignmentScoreCalculator();

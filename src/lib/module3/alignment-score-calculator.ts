import type { IntermediateSynthesis, ScoredCareerPath } from "./types";

const APTITUDE_WEIGHT = parseFloat(process.env.APTITUDE_WEIGHT ?? "0.35");
const DEMAND_WEIGHT = parseFloat(process.env.DEMAND_WEIGHT ?? "0.40");
const FEASIBILITY_WEIGHT = parseFloat(process.env.FEASIBILITY_WEIGHT ?? "0.25");

export class AlignmentScoreCalculator {
  calculate(synthesis: IntermediateSynthesis): ScoredCareerPath[] {
    const scored: ScoredCareerPath[] = synthesis.candidates.map((candidate) => {
      const alignmentScore =
        APTITUDE_WEIGHT * candidate.aptitudeScore +
        DEMAND_WEIGHT * candidate.demandScore +
        FEASIBILITY_WEIGHT * candidate.feasibilityScore;

      return {
        ...candidate,
        alignmentScore: Math.round(alignmentScore * 1000) / 1000,
      };
    });

    scored.sort((a, b) => b.alignmentScore - a.alignmentScore);

    return scored;
  }
}

export const alignmentScoreCalculator = new AlignmentScoreCalculator();

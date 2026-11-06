import { ProcessingBudget, ProcessingError } from "@/lib/processing-budget";
import type { RankedRecommendationList } from "@/lib/report/types";
import type { AgentOutput } from "./types";
import { synthesisInterpreter } from "./synthesis-interpreter";
import { alignmentScoreCalculator } from "./alignment-score-calculator";
import { rankingAgent } from "./ranking-agent";
import { rankedRecommendationBuilder } from "./ranked-recommendation-builder";

export class MetaAgentSynthesizer {
  async synthesize(
    sessionId: string,
    agentOutputs: AgentOutput[],
    budget = new ProcessingBudget(),
    persist = true,
  ): Promise<RankedRecommendationList> {
    const synthesis = await synthesisInterpreter.synthesize(agentOutputs, budget);

    const scoredPaths = alignmentScoreCalculator.calculate(synthesis);

    const rankedPaths = await this.runRankingAgent(scoredPaths, budget);

    budget.assert("recommendation assembly");
    return rankedRecommendationBuilder.build(sessionId, rankedPaths, agentOutputs, persist);
  }

  private async runRankingAgent(scoredPaths: Awaited<ReturnType<typeof alignmentScoreCalculator.calculate>>, budget: ProcessingBudget) {
    try {
      return await rankingAgent.generateReasoning(scoredPaths, budget);
    } catch (error) {
      if (error instanceof ProcessingError) throw error;
      console.warn("[MetaAgentSynthesizer] RankingAgent failed, proceeding with placeholder reasoning");
      return scoredPaths.map((path) => ({
        ...path,
        reasoningSummary: "",
      }));
    }
  }
}

export const metaAgentSynthesizer = new MetaAgentSynthesizer();

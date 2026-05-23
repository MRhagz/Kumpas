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
  ): Promise<RankedRecommendationList> {
    const synthesis = await this.runSynthesisInterpreter(agentOutputs);

    const scoredPaths = alignmentScoreCalculator.calculate(synthesis);

    const rankedPaths = await this.runRankingAgent(scoredPaths);

    return rankedRecommendationBuilder.build(sessionId, rankedPaths, agentOutputs);
  }

  private async runSynthesisInterpreter(agentOutputs: AgentOutput[]) {
    try {
      return await synthesisInterpreter.synthesize(agentOutputs);
    } catch (firstError) {
      console.warn("[MetaAgentSynthesizer] SynthesisInterpreter first attempt failed, retrying...", firstError);
      return await synthesisInterpreter.synthesize(agentOutputs);
    }
  }

  private async runRankingAgent(scoredPaths: Awaited<ReturnType<typeof alignmentScoreCalculator.calculate>>) {
    try {
      return await rankingAgent.generateReasoning(scoredPaths);
    } catch (error) {
      console.warn("[MetaAgentSynthesizer] RankingAgent failed, proceeding with placeholder reasoning", error);
      return scoredPaths.map((path) => ({
        ...path,
        reasoningSummary: "",
      }));
    }
  }
}

export const metaAgentSynthesizer = new MetaAgentSynthesizer();

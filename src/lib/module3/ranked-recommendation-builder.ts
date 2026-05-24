import { supabaseAdmin } from "@/lib/supabase";
import type { RankedRecommendationList, RecommendationSource } from "@/lib/report/types";
import type { AgentOutput, RankedCareerPath } from "./types";

export class RankedRecommendationBuilder {
  async build(
    sessionId: string,
    rankedPaths: RankedCareerPath[],
    agentOutputs: AgentOutput[],
  ): Promise<RankedRecommendationList> {
    const failedAgents = agentOutputs
      .filter((o) => o.status === "FAILED")
      .map((o) => o.agentName);

    const recommendations = rankedPaths.map((path, index) => {
      const hasFailedContributor = failedAgents.length > 0;
      const hasEmptyReasoning = !path.reasoningSummary.trim();

      let status: "complete" | "degraded" | "incomplete" = "complete";
      let degradedReason: string | undefined;
      let incompleteReason: string | undefined;

      if (hasFailedContributor) {
        status = "incomplete";
        incompleteReason = `Agent(s) failed: ${failedAgents.join(", ")}`;
      } else if (hasEmptyReasoning) {
        status = "degraded";
        degradedReason = "Reasoning summary unavailable";
      }

      const sources: RecommendationSource[] = path.sourceReferences.map(
        (ref) => ({
          id: crypto.randomUUID(),
          title: ref.title,
          reference: ref.reference,
          acquisitionMethod: ref.acquisitionMethod as RecommendationSource["acquisitionMethod"],
          ingestionTimestamp: ref.ingestionTimestamp || new Date().toISOString(),
          relatedSignals: ref.relatedSignals ?? [],
        }),
      );

      return {
        id: crypto.randomUUID(),
        rank: index + 1,
        careerPath: path.careerPath,
        alignmentScore: path.alignmentScore,
        aptitudeFit: path.aptitudeScore,
        marketDemand: path.demandScore,
        financialFeasibility: path.feasibilityScore,
        reasoningSummary: path.reasoningSummary || "Reasoning not available.",
        keySignals: path.signals,
        keySignalDetails: path.keySignalDetails,
        sources,
        status,
        degradedReason,
        incompleteReason,
      };
    });

    if (recommendations.length < 3) {
      throw new Error(
        `At least 3 recommendations required, got ${recommendations.length}`,
      );
    }

    const recRows = recommendations.map((r) => ({
      id: r.id,
      session_id: sessionId,
      rank: r.rank,
      career_path: r.careerPath,
      alignment_score: r.alignmentScore,
      aptitude_fit: r.aptitudeFit,
      market_demand: r.marketDemand,
      financial_feasibility: r.financialFeasibility,
      reasoning_summary: r.reasoningSummary,
      key_signals: r.keySignals,
      key_signal_details: r.keySignalDetails,
      status: r.status,
      degraded_reason: r.degradedReason ?? null,
      incomplete_reason: r.incompleteReason ?? null,
    }));

    const { error: deleteError } = await supabaseAdmin
      .from("ranked_recommendations")
      .delete()
      .eq("session_id", sessionId);
    if (deleteError) {
      throw new Error(
        `Failed to clear prior ranked_recommendations: ${deleteError.message}`,
      );
    }

    const { error: recError } = await supabaseAdmin
      .from("ranked_recommendations")
      .insert(recRows);
    if (recError) {
      throw new Error(`Failed to write ranked_recommendations: ${recError.message}`);
    }

    const sourceRows = recommendations.flatMap((r) =>
      r.sources.map((s) => ({
        id: s.id,
        recommendation_id: r.id,
        title: s.title,
        reference: s.reference,
        acquisition_method: s.acquisitionMethod,
        ingestion_timestamp: isNaN(Date.parse(s.ingestionTimestamp))
          ? new Date().toISOString()
          : s.ingestionTimestamp,
        related_signals: s.relatedSignals,
      })),
    );

    if (sourceRows.length > 0) {
      const { error: srcError } = await supabaseAdmin
        .from("recommendation_sources")
        .insert(sourceRows);
      if (srcError) {
        throw new Error(`Failed to write recommendation_sources: ${srcError.message}`);
      }
    }

    return {
      sessionId,
      generatedAt: new Date().toISOString(),
      recommendations,
    };
  }
}

export const rankedRecommendationBuilder = new RankedRecommendationBuilder();

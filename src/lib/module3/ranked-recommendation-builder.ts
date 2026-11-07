import { supabaseAdmin } from "@/lib/supabase";
import type { RankedRecommendationList, RecommendationSource } from "@/lib/report/types";
import { ALIGNMENT_WEIGHTS, InsufficientEvidenceError } from "./alignment-score-calculator";
import type { AgentOutput, RankedCareerPath } from "./types";
import { AGENT_SILO_MAP } from "./types";
import { sourceDate, publicSourceUrl, evidenceClaims, summaryText } from "@/lib/report/evidence-summary";

export class RankedRecommendationBuilder {
  async build(
    sessionId: string,
    rankedPaths: RankedCareerPath[],
    agentOutputs: AgentOutput[],
    approvedProfileVersion: number | null = null,
    persist = true,
  ): Promise<RankedRecommendationList> {
    const agentStatuses = (Object.keys(AGENT_SILO_MAP) as AgentOutput["agentName"][]).map((agent) => {
      const output = agentOutputs.find((o) => o.agentName === agent);
      return { agent, status: output?.status ?? "UNAVAILABLE" as const,
        error: output?.error, unavailableEvidence: output?.unavailableEvidence ?? [] };
    });
    const failedAgents = agentStatuses.filter((o) => o.status !== "SUCCESS").map((o) => o.agent);

    const supportedPaths = rankedPaths.filter((p) => p.aptitudeScore !== null || p.demandScore !== null || p.feasibilityScore !== null);
    if (supportedPaths.length === 0) throw new InsufficientEvidenceError();

    const recommendations = supportedPaths.map((path) => {
      const hasFailedContributor = failedAgents.length > 0;
      const claims = evidenceClaims(path);
      const hasEmptyReasoning = !claims.length || path.reasoningSummary !== summaryText(claims);

      let status: "complete" | "degraded" | "incomplete" = "complete";
      let degradedReason: string | undefined;
      let incompleteReason: string | undefined;

      const missing = [path.aptitudeScore === null ? "aptitude" : "", path.demandScore === null ? "demand" : "", path.feasibilityScore === null ? "feasibility" : ""].filter(Boolean);
      if (missing.length > 0) {
        status = "incomplete";
        incompleteReason = `Unscored partial comparison: missing ${missing.join(", ")}.`;
      } else if (hasFailedContributor) {
        status = "incomplete";
        incompleteReason = `Agent(s) failed: ${failedAgents.join(", ")}`;
      } else if (hasEmptyReasoning) {
        status = "degraded";
        degradedReason = "Reasoning summary unavailable";
      }
      if (hasFailedContributor) {
        incompleteReason = `${incompleteReason ?? ""} Specialist analysis failed or unavailable: ${failedAgents.join(", ")}. Retry analysis or review the confirmed inputs.`.trim();
      }

      const sources: RecommendationSource[] = path.sourceReferences.map(
        (ref) => ({
          id: crypto.randomUUID(),
          title: ref.title,
          reference: ref.reference,
          acquisitionMethod: ref.acquisitionMethod as RecommendationSource["acquisitionMethod"],
          ingestionTimestamp: sourceDate(ref.ingestionTimestamp),
          publicationDate: sourceDate(ref.publicationDate),
          sourceUrl: publicSourceUrl(ref.sourceUrl) ?? publicSourceUrl(ref.reference),
          chunkIndex: ref.chunkIndex,
          siloId: ref.siloId,
          relatedSignals: claims.filter((claim) => claim.sourceReferences.some((source) => source.reference === ref.reference && source.chunkIndex === ref.chunkIndex && source.siloId === ref.siloId)).map((claim) => claim.text),
        }),
      );

      return {
        id: crypto.randomUUID(),
        rank: path.rank,
        careerPath: path.careerPath,
        alignmentScore: path.alignmentScore,
        aptitudeFit: path.aptitudeScore,
        marketDemand: path.demandScore,
        financialFeasibility: path.feasibilityScore,
        reasoningSummary: hasEmptyReasoning ? "Evidence summary unavailable." : path.reasoningSummary,
        approvedProfileVersion,
        componentEvidence: Object.fromEntries(Object.entries(path.componentEvidence).map(([dimension, evidence]) => [dimension,
          evidence ? { ...evidence, explanation: claims.find((claim) => claim.dimension === dimension)?.text ?? "Evidence summary unavailable." } : null])) as typeof path.componentEvidence,
        weights: ALIGNMENT_WEIGHTS,
        keySignals: claims.length ? claims.map((claim) => claim.text) : ["Evidence summary unavailable."],
        keySignalDetails: claims.map((claim) => ({ label: `${claim.dimension[0].toUpperCase()}${claim.dimension.slice(1)} evidence`, value: claim.text, polarity: "neutral" as const })),
        sources,
        status,
        degradedReason,
        incompleteReason,
      };
    });

    const result: RankedRecommendationList = {
      sessionId, generatedAt: new Date().toISOString(), recommendations, scoreContract: "0-100-v1", agentStatuses,
      limitation: recommendations.filter((r) => r.alignmentScore !== null).length < 3
        ? "Fewer than three scored paths are supported. Unscored partial comparisons have missing evidence; no weights were redistributed." : undefined,
    };
    if (!persist) return result;

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
      approved_profile_version: r.approvedProfileVersion,
      component_evidence: r.componentEvidence,
      score_weights: r.weights,
      score_contract: "0-100-v1",
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
        ingestion_timestamp: s.ingestionTimestamp,
        publication_date: s.publicationDate,
        source_url: s.sourceUrl,
        chunk_index: s.chunkIndex ?? null,
        silo_id: s.siloId ?? null,
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

    return result;
  }
}

export const rankedRecommendationBuilder = new RankedRecommendationBuilder();

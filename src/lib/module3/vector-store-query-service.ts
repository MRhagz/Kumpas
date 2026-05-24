import { supabaseAdmin } from "@/lib/supabase";
import type { AgentName, RetrievedChunk, SiloId } from "./types";
import { AGENT_SILO_MAP } from "./types";

const DEFAULT_MATCH_COUNT = 5;
const DEFAULT_MATCH_THRESHOLD = 0.3;

export class VectorStoreQueryService {
  async query(
    agentName: AgentName,
    queryEmbedding: number[],
    matchCount: number = DEFAULT_MATCH_COUNT,
    matchThreshold: number = DEFAULT_MATCH_THRESHOLD,
  ): Promise<RetrievedChunk[]> {
    const allowedSilo: SiloId = AGENT_SILO_MAP[agentName];
    if (!allowedSilo) {
      throw new Error(`Routing error: no silo assigned to agent "${agentName}"`);
    }

    const { data, error } = await supabaseAdmin.rpc("match_knowledge_chunks", {
      query_embedding: JSON.stringify(queryEmbedding),
      target_silo_id: allowedSilo,
      match_count: matchCount,
      match_threshold: matchThreshold,
    });

    if (error) {
      throw new Error(`Vector search failed for ${agentName}: ${error.message}`);
    }

    return (data ?? []) as RetrievedChunk[];
  }
}

export const vectorStoreQueryService = new VectorStoreQueryService();

import { supabaseAdmin } from "@/lib/supabase";
import type { AgentName, RetrievedChunk, SiloId } from "./types";
import { AGENT_SILO_MAP, AGENT_SOURCE_MAP } from "./types";

import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  assertEmbeddingConfiguration,
  assertEmbeddingVector,
} from "./embedding-contract";

const DEFAULT_MATCH_COUNT = 5;
const DEFAULT_MATCH_THRESHOLD = 0.3;

export class VectorStoreQueryService {
  async query(
    agentName: AgentName,
    queryEmbedding: number[],
    matchCount: number = DEFAULT_MATCH_COUNT,
    matchThreshold: number = DEFAULT_MATCH_THRESHOLD,
    signal?: AbortSignal,
  ): Promise<RetrievedChunk[]> {
    assertEmbeddingConfiguration();
    assertEmbeddingVector(queryEmbedding);
    if (!Object.hasOwn(AGENT_SILO_MAP, agentName)) {
      throw new Error(`Routing error: no silo assigned to agent "${agentName}"`);
    }

    const allowedSilo: SiloId = AGENT_SILO_MAP[agentName];
    if (!Number.isInteger(matchCount) || matchCount < 1 ||
        !Number.isFinite(matchThreshold) || matchThreshold < -1 || matchThreshold > 1) {
      throw new Error("Invalid vector search limits");
    }

    const request = supabaseAdmin.rpc("match_knowledge_chunks", {
      query_embedding: JSON.stringify(queryEmbedding),
      target_silo_id: allowedSilo,
      request_agent: agentName,
      query_model: EMBEDDING_MODEL,
      query_dimensions: EMBEDDING_DIMENSIONS,
      match_count: matchCount,
      match_threshold: matchThreshold,
    });

    const { data, error } = await (signal ? request.abortSignal(signal) : request);

    if (error) {
      throw Object.assign(new Error("Supabase knowledge retrieval unavailable. Retry analysis."), { retryable: false });
    }

    const chunks = (data ?? []) as RetrievedChunk[];
    if (!Array.isArray(chunks) || chunks.some((chunk) =>
      !chunk || chunk.silo_id !== allowedSilo ||
      !AGENT_SOURCE_MAP[agentName].includes(chunk.source_type) ||
      chunk.embedding_model !== EMBEDDING_MODEL ||
      chunk.embedding_dimensions !== EMBEDDING_DIMENSIONS
    )) {
      throw new Error(`Vector search returned unauthorized evidence for ${agentName}`);
    }
    return chunks;
  }
}

export const vectorStoreQueryService = new VectorStoreQueryService();

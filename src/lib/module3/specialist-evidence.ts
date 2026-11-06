import { AGENT_SOURCE_MAP } from "./types";
import type { AgentName, RetrievedChunk } from "./types";

export function unavailableEvidence(agent: AgentName, chunks: RetrievedChunk[]): string[] {
  return AGENT_SOURCE_MAP[agent]
    .filter((source) => !chunks.some((chunk) => chunk.source_type === source))
    .map((source) => `${source}: no relevant public evidence retrieved`);
}

export function evidenceContext(agent: AgentName, chunks: RetrievedChunk[]): string {
  const records = chunks.map((chunk) => JSON.stringify({
    silo_id: chunk.silo_id,
    source_type: chunk.source_type,
    source_url: chunk.source_url,
    chunk_index: chunk.chunk_index,
    official_source_url: chunk.official_source_url,
    publication_date: chunk.publication_date,
    acquisition_method: chunk.acquisition_method,
    ingestion_timestamp: chunk.ingestion_timestamp,
    content: chunk.content,
  }));
  return [...records, ...unavailableEvidence(agent, chunks)].join("\n\n---\n\n");
}

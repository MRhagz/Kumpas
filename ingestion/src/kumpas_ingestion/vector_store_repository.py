from dataclasses import dataclass
from datetime import datetime, timezone

from supabase import Client

from .models import ChunkInput, KnowledgeChunk
from .silos import SiloId


@dataclass(frozen=True)
class ChunkDiff:
    """Partitioning of incoming chunks against the current database state.

    Embeddings should only be computed for chunks in `to_insert` and `to_update`;
    `to_skip` already has an identical content_hash on the row, so the existing
    embedding can be reused.
    """

    to_insert: list[ChunkInput]
    to_update: list[ChunkInput]
    to_skip: list[ChunkInput]


class VectorStoreRepository:
    """Reads and writes to the knowledge_chunks table and ingestion_metadata.

    Upsert policy per SDD 1.1:
      - if (silo_id, source_url, chunk_index) exists and content_hash matches → skip
      - if exists and content_hash differs → update content, hash, embedding, timestamp
      - if absent → insert
    """

    def __init__(self, supabase: Client) -> None:
        self._supabase = supabase

    def diff(self, chunks: list[ChunkInput]) -> ChunkDiff:
        if not chunks:
            return ChunkDiff(to_insert=[], to_update=[], to_skip=[])

        existing = self._fetch_existing_hashes(chunks)
        to_insert: list[ChunkInput] = []
        to_update: list[ChunkInput] = []
        to_skip: list[ChunkInput] = []

        for chunk in chunks:
            key = (chunk.silo_id.value, chunk.source_url, chunk.chunk_index)
            existing_hash = existing.get(key)
            if existing_hash is None:
                to_insert.append(chunk)
            elif existing_hash == chunk.content_hash:
                to_skip.append(chunk)
            else:
                to_update.append(chunk)

        return ChunkDiff(to_insert=to_insert, to_update=to_update, to_skip=to_skip)

    def write(self, chunks: list[KnowledgeChunk]) -> int:
        if not chunks:
            return 0
        payload = [_serialize(chunk) for chunk in chunks]
        result = (
            self._supabase.table("knowledge_chunks")
            .upsert(payload, on_conflict="silo_id,source_url,chunk_index")
            .execute()
        )
        return len(result.data or payload)

    def update_ingestion_metadata(
        self,
        source_type: str,
        log_id: str,
        ingestion_timestamp: datetime | None = None,
    ) -> None:
        ts = ingestion_timestamp or datetime.now(timezone.utc)
        payload = {
            "source_type": source_type,
            "last_ingestion_timestamp": ts.isoformat(),
            "last_success_log_id": log_id,
            "updated_at": ts.isoformat(),
        }
        (
            self._supabase.table("ingestion_metadata")
            .upsert(payload, on_conflict="source_type")
            .execute()
        )

    def known_publication_urls(self, source_type: str) -> set[str]:
        """Returns publication URLs already recorded for this source_type.

        Backs the PublicationIndexChecker change-detection step for Module 1.2.
        """
        result = (
            self._supabase.table("publication_index_cache")
            .select("publication_url")
            .eq("source_type", source_type)
            .execute()
        )
        return {row["publication_url"] for row in result.data or []}

    def record_publication_ingested(
        self,
        publication_url: str,
        source_type: str,
        log_id: str,
        ingested_at: datetime | None = None,
    ) -> None:
        ts = ingested_at or datetime.now(timezone.utc)
        payload = {
            "publication_url": publication_url,
            "source_type": source_type,
            "ingested_at": ts.isoformat(),
            "ingestion_log_id": log_id,
        }
        (
            self._supabase.table("publication_index_cache")
            .upsert(payload, on_conflict="publication_url")
            .execute()
        )

    def _fetch_existing_hashes(
        self, chunks: list[ChunkInput]
    ) -> dict[tuple[str, str, int], str]:
        by_silo: dict[SiloId, set[str]] = {}
        for chunk in chunks:
            by_silo.setdefault(chunk.silo_id, set()).add(chunk.source_url)

        existing: dict[tuple[str, str, int], str] = {}
        for silo_id, source_urls in by_silo.items():
            result = (
                self._supabase.table("knowledge_chunks")
                .select("silo_id, source_url, chunk_index, content_hash")
                .eq("silo_id", silo_id.value)
                .in_("source_url", list(source_urls))
                .execute()
            )
            for row in result.data or []:
                key = (row["silo_id"], row["source_url"], row["chunk_index"])
                existing[key] = row["content_hash"]
        return existing


def _serialize(chunk: KnowledgeChunk) -> dict:
    payload = chunk.model_dump(exclude={"ingestion_timestamp"})
    payload["silo_id"] = chunk.silo_id.value
    if chunk.ingestion_timestamp is not None:
        payload["ingestion_timestamp"] = chunk.ingestion_timestamp.isoformat()
    return payload

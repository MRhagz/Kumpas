from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from supabase import Client
    from .embedding_service import EmbeddingService

from .config import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL
from .models import ChunkInput, KnowledgeChunk, SourceType


@dataclass(frozen=True)
class ChunkDiff:
    to_insert: list[ChunkInput]
    to_update: list[ChunkInput]
    to_skip: list[ChunkInput]
    existing: list[dict]


class VectorStoreRepository:
    """Diff before embedding; replace a validated batch in one database transaction."""

    def __init__(self, supabase: "Client") -> None:
        self._supabase = supabase

    def diff(
        self, chunks: list[ChunkInput], source_type: SourceType, *, replace_all: bool = False
    ) -> ChunkDiff:
        if not chunks:
            return ChunkDiff([], [], [], [])
        if any(c.source_type != source_type for c in chunks):
            raise ValueError("A refresh batch must contain exactly one source type")
        if len({c.key for c in chunks}) != len(chunks):
            raise ValueError("Duplicate stable chunk key in refresh batch")
        rows = self._fetch_existing(chunks, source_type, replace_all)
        existing = {(r["silo_id"], r["source_url"], r["chunk_index"]): r for r in rows}
        inserted, updated, skipped = [], [], []
        for chunk in chunks:
            row = existing.get(chunk.key)
            if row is None:
                inserted.append(chunk)
            elif (row["content_hash"], row["embedding_model"], row["embedding_dimensions"]) == (
                chunk.content_hash, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS
            ):
                skipped.append(chunk)
            else:
                updated.append(chunk)
        return ChunkDiff(inserted, updated, skipped, rows)

    def refresh(
        self,
        chunks: list[ChunkInput],
        source_type: SourceType,
        embedder: "EmbeddingService",
        log_entry: dict,
        *,
        replace_all: bool = False,
    ) -> tuple[int, dict[str, int]]:
        diff = self.diff(chunks, source_type, replace_all=replace_all)
        changed = diff.to_insert + diff.to_update
        vectors = embedder.embed_documents([c.content for c in changed]) if changed else []
        # Validate every vector before the single write; a partial provider result cannot commit.
        embedded = {
            chunk.key: KnowledgeChunk(
                **chunk.model_dump(exclude={"content_hash"}), embedding=vector
            )
            for chunk, vector in zip(changed, vectors, strict=True)
        }
        counts = {"inserted": len(diff.to_insert), "updated": len(diff.to_update),
                  "skipped_unchanged": len(diff.to_skip)}
        if not chunks:
            return 0, counts
        payload = []
        for chunk in chunks:
            record = embedded.get(chunk.key)
            payload.append(record.model_dump(mode="json") if record else {
                **chunk.model_dump(mode="json"), "embedding": None,
                "embedding_model": EMBEDDING_MODEL, "embedding_dimensions": EMBEDDING_DIMENSIONS,
            })
        log_entry = {**log_entry, "run_metadata": {**log_entry.get("run_metadata", {}), **counts}}
        result = self._supabase.rpc("refresh_knowledge_chunks", {
            "p_source_type": source_type,
            "p_log": log_entry,
            "p_source_urls": None if replace_all else sorted({c.source_url for c in chunks}),
            "p_chunks": payload,
            "p_expected": [{k: row[k] for k in (
                "silo_id", "source_url", "chunk_index", "content_hash",
                "embedding_model", "embedding_dimensions"
            )} for row in diff.existing],
        }).execute()
        return int(result.data), counts

    def known_publication_urls(self, source_type: str) -> set[str]:
        """Returns publication URLs already recorded for this source_type.

        Backs the PublicationIndexChecker change-detection step for Module 1.2.
        """
        cached: set[str] = set()
        offset = 0
        while True:
            result = self._supabase.table("publication_index_cache").select(
                "publication_url"
            ).eq("source_type", source_type).order("publication_url").range(offset, offset + 499).execute()
            page = result.data or []
            cached.update(row["publication_url"] for row in page)
            if len(page) < 500:
                break
            offset += len(page)
        # A historical cache entry cannot certify the embedding space of its records.
        compatible, incompatible = set(), set()
        offset = 0
        while True:
            result = self._supabase.table("knowledge_chunks").select(
                "source_url,embedding_model,embedding_dimensions"
            ).eq("source_type", source_type).order("source_url").order("chunk_index").range(
                offset, offset + 499
            ).execute()
            page = result.data or []
            for row in page:
                target = compatible if (row["embedding_model"], row["embedding_dimensions"]) == (
                    EMBEDDING_MODEL, EMBEDDING_DIMENSIONS
                ) else incompatible
                target.add(row["source_url"])
            if len(page) < 500:
                break
            offset += len(page)
        return cached & compatible - incompatible

    def _fetch_existing(
        self, chunks: list[ChunkInput], source_type: SourceType, replace_all: bool
    ) -> list[dict]:
        rows: list[dict] = []
        while True:
            query = self._supabase.table("knowledge_chunks").select(
                "silo_id,source_url,chunk_index,content_hash,embedding_model,embedding_dimensions"
            ).eq("source_type", source_type)
            if not replace_all:
                query = query.in_("source_url", sorted({c.source_url for c in chunks}))
            result = query.order("silo_id").order("source_url").order("chunk_index").range(
                len(rows), len(rows) + 499
            ).execute()
            page = result.data or []
            rows.extend(page)
            if len(page) < 500:
                return rows

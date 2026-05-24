"""Module 1.1 — PSA OpenSTAT LFS CSV ingestion (operator-curated).

The PSA OpenSTAT and psa.gov.ph portals sit behind a CDN that blocks
non-browser HTTP clients, so the LFS CSV cannot be fetched directly
from a scheduled CI job. Instead, the development team (the operator)
downloads the latest quarterly Labor Force Survey table through a real
browser, normalizes column names to the schema below, and commits the
cleaned CSV into ingestion/data/psa/. A push to that path triggers the
ingest-psa workflow, which reads the file from the runner's checkout,
embeds each record via EmbeddingService, and upserts into the
market_analytics silo with acquisition_method=operator_curated_csv.

Source URL is required via PSA_OPENSTAT_URL — the workflow sets this
to a `file://` path inside the runner. The HTTP scheme is still
supported for future use (e.g. an ILOSTAT proxy or a sanctioned PSA
data-sharing endpoint), but is not used in the default Option A flow.

Expected CSV schema (exact column names, no extras required):
    period, occupation_major_group, sector, region, employed_thousands

If the PSA download has different column names, normalize them upstream
(rename in the published CSV before pointing this pipeline at it).

Stale rows: this pipeline never deletes. If an occupation/sector/region
combination disappears from the source, its knowledge_chunks row lingers.
"""

from __future__ import annotations

import io
import os
import sys
from decimal import Decimal, InvalidOperation
from typing import Iterable

import httpx
import pandas as pd
from pydantic import BaseModel, Field, ValidationError, field_validator
from supabase import create_client

from ..config import IngestionConfig
from ..embedding_service import EmbeddingService
from ..ingestion_logger import IngestionLogger
from ..models import ChunkInput, KnowledgeChunk
from ..silos import SiloId
from ..vector_store_repository import VectorStoreRepository

WORKFLOW_NAME = "psa_openstat_lfs"
SOURCE_TYPE = "psa_openstat_lfs"
REQUIRED_COLUMNS = [
    "period",
    "occupation_major_group",
    "sector",
    "region",
    "employed_thousands",
]


class OccupationRecord(BaseModel):
    period: str = Field(min_length=1)
    occupation_major_group: str = Field(min_length=1)
    sector: str = Field(min_length=1)
    region: str = Field(min_length=1)
    employed_thousands: Decimal = Field(gt=0)

    @field_validator("period", "occupation_major_group", "sector", "region")
    @classmethod
    def _strip_and_require(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned

    def source_url(self, base_url: str) -> str:
        suffix = f"{self.period}|{self.occupation_major_group}|{self.sector}|{self.region}"
        return f"{base_url}#{suffix}"

    def to_embedding_text(self) -> str:
        return (
            f"PSA Labor Force Survey {self.period}: number of employed persons "
            f"in the {self.occupation_major_group} group, {self.sector} sector, "
            f"{self.region}: {self.employed_thousands} thousand persons."
        )

    def to_chunk_input(self, base_url: str) -> ChunkInput:
        return ChunkInput(
            silo_id=SiloId.MARKET_ANALYTICS,
            source_url=self.source_url(base_url),
            chunk_index=0,
            content=self.to_embedding_text(),
            acquisition_method="operator_curated_csv",
            source_metadata={
                "period": self.period,
                "occupation_major_group": self.occupation_major_group,
                "sector": self.sector,
                "region": self.region,
                "employed_thousands": str(self.employed_thousands),
                "dataset_url": base_url,
            },
        )


class IngestionFailure(Exception):
    pass


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise IngestionFailure(
            f"{name} is required but not set. "
            "Point at the PSA OpenSTAT CSV URL (https://...) or a local file:// path."
        )
    return value


def download_csv(url: str) -> bytes:
    if url.startswith("file://"):
        path = url.removeprefix("file://")
        with open(path, "rb") as fh:
            return fh.read()
    response = httpx.get(url, timeout=60.0, follow_redirects=True)
    if response.status_code != 200:
        raise IngestionFailure(
            f"PSA download returned HTTP {response.status_code} for {url}"
        )
    return response.content


def parse_csv(raw_bytes: bytes) -> pd.DataFrame:
    try:
        df = pd.read_csv(io.BytesIO(raw_bytes), encoding="utf-8")
    except UnicodeDecodeError:
        df = pd.read_csv(io.BytesIO(raw_bytes), encoding="latin-1")
    df.columns = [c.strip() for c in df.columns]
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise IngestionFailure(
            f"PSA CSV is missing required columns: {missing}. "
            f"Saw columns: {list(df.columns)}"
        )
    return df[REQUIRED_COLUMNS]


def extract_records(df: pd.DataFrame) -> tuple[list[OccupationRecord], list[str]]:
    records: list[OccupationRecord] = []
    skipped: list[str] = []
    seen: set[tuple[str, str, str, str]] = set()

    for line_number, raw_row in enumerate(df.to_dict(orient="records"), start=2):
        try:
            row = {
                **raw_row,
                "employed_thousands": Decimal(str(raw_row["employed_thousands"])),
            }
            record = OccupationRecord.model_validate(row)
        except (ValidationError, InvalidOperation, ValueError, TypeError) as exc:
            skipped.append(f"row {line_number}: {exc}")
            continue

        key = (record.period, record.occupation_major_group, record.sector, record.region)
        if key in seen:
            skipped.append(f"row {line_number}: duplicate composite key {key} in same CSV")
            continue
        seen.add(key)
        records.append(record)

    return records, skipped


def _print_skip_report(skipped: Iterable[str]) -> None:
    print("PSA CSV rows skipped (will not block the run):")
    for line in skipped:
        print(f"  - {line}")


def run() -> int:
    cfg = IngestionConfig.from_env()
    dataset_url = _require_env("PSA_OPENSTAT_URL")

    supabase = create_client(cfg.supabase_url, cfg.supabase_service_role_key)
    logger = IngestionLogger(supabase, workflow_name=WORKFLOW_NAME)
    logger.start(silo_id=SiloId.MARKET_ANALYTICS)

    try:
        raw_bytes = download_csv(dataset_url)
        df = parse_csv(raw_bytes)
        records, skipped = extract_records(df)
    except (IngestionFailure, FileNotFoundError) as exc:
        logger.record(run_status="failure", error_message=str(exc))
        print(str(exc))
        return 1

    if skipped:
        _print_skip_report(skipped)
    if not records:
        logger.record(
            run_status="failure",
            error_message="No valid records extracted from PSA CSV",
            run_metadata={"skipped": skipped[:50], "dataset_url": dataset_url},
        )
        print("No valid records extracted — check PSA URL and CSV schema.")
        return 1

    repository = VectorStoreRepository(supabase)
    chunk_inputs = [r.to_chunk_input(dataset_url) for r in records]
    diff = repository.diff(chunk_inputs)

    print(
        f"PSA diff: {len(diff.to_insert)} new, {len(diff.to_update)} changed, "
        f"{len(diff.to_skip)} unchanged"
    )

    needs_embedding = diff.to_insert + diff.to_update
    if not needs_embedding:
        log_id = logger.record(
            run_status="no_op",
            run_metadata={
                "total_records": len(records),
                "skipped_rows": len(skipped),
                "dataset_url": dataset_url,
            },
        )
        repository.update_ingestion_metadata(SOURCE_TYPE, log_id)
        return 0

    embedding_service = EmbeddingService(cfg)
    try:
        vectors = embedding_service.embed_documents(
            [c.content for c in needs_embedding]
        )
    finally:
        embedding_service.close()

    knowledge_chunks: list[KnowledgeChunk] = [
        KnowledgeChunk(
            silo_id=chunk.silo_id,
            source_url=chunk.source_url,
            chunk_index=chunk.chunk_index,
            content=chunk.content,
            content_hash=chunk.content_hash,
            embedding=vector,
            acquisition_method=chunk.acquisition_method,
            source_metadata=chunk.source_metadata,
        )
        for chunk, vector in zip(needs_embedding, vectors, strict=True)
    ]

    written = repository.write(knowledge_chunks)
    log_id = logger.record(
        run_status="success",
        records_upserted=written,
        run_metadata={
            "total_records": len(records),
            "inserted": len(diff.to_insert),
            "updated": len(diff.to_update),
            "skipped_unchanged": len(diff.to_skip),
            "skipped_rows": len(skipped),
            "dataset_url": dataset_url,
        },
    )
    repository.update_ingestion_metadata(SOURCE_TYPE, log_id)
    return 0


if __name__ == "__main__":
    sys.exit(run())

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

Acquisition location is required via PSA_OPENSTAT_URL — the workflow sets this
to a `file://` path inside the runner. PSA_SOURCE_URL supplies the official
source reference independently of that runner path. The HTTP scheme is still
supported for future use (e.g. an ILOSTAT proxy or a sanctioned PSA
data-sharing endpoint), but is not used in the default Option A flow.

Expected CSV schema (exact column names, no extras required):
    period, occupation_major_group, sector, region, employed_thousands

If the PSA download has different column names, normalize them upstream
(rename in the published CSV before pointing this pipeline at it).

A fully validated CSV replaces this source group atomically, including removed records.
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import sys
from decimal import Decimal, InvalidOperation

import httpx
import pandas as pd
from pydantic import BaseModel, Field, ValidationError, field_validator
from supabase import create_client

from ..config import IngestionConfig, require_https
from ..embedding_service import EmbeddingService
from ..ingestion_logger import IngestionLogger
from ..models import ChunkInput
from ..silos import SiloId
from ..vector_store_repository import VectorStoreRepository

WORKFLOW_NAME = "psa_openstat_lfs"
SOURCE_TYPE = "psa_openstat_lfs"
MIN_RECORDS = 10
REQUIRED_COLUMNS = [
    "period",
    "occupation_major_group",
    "sector",
    "region",
    "employed_thousands",
]


class OccupationRecord(BaseModel):
    period: str = Field(pattern=r"^[0-9]{4}-?Q[1-4]$")
    occupation_major_group: str = Field(min_length=1)
    sector: str = Field(min_length=1)
    region: str = Field(min_length=1)
    employed_thousands: Decimal = Field(gt=0)

    @field_validator("period", "occupation_major_group", "sector", "region", mode="before")
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

    def to_chunk_input(self, base_url: str, publication_date: str | None = None) -> ChunkInput:
        return ChunkInput(
            source_type=SOURCE_TYPE,
            silo_id=SiloId.MARKET_ANALYTICS,
            source_url=self.source_url(base_url),
            chunk_index=0,
            content=self.to_embedding_text(),
            acquisition_method="operator_curated_csv",
            official_source_url=base_url,
            publication_date=publication_date,
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
    with httpx.Client(timeout=60.0, follow_redirects=True,
                      event_hooks={"request": [require_https]}) as client:
        response = client.get(url)
    if response.status_code != 200:
        raise IngestionFailure(
            f"PSA download returned HTTP {response.status_code} for {url}"
        )
    return response.content


def parse_csv(raw_bytes: bytes) -> pd.DataFrame:
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw_bytes.decode("latin-1")
    # pandas can silently infer an index from an over-wide first row or rename
    # duplicate headers. Reject both before allowing it to interpret the CSV.
    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    try:
        headers = [c.strip() for c in next(reader)]
        if len(headers) != len(set(headers)):
            raise IngestionFailure("PSA CSV row 1: duplicate column names")
        for row in reader:
            if len(row) != len(headers):
                raise IngestionFailure(
                    f"PSA CSV row {reader.line_num}: expected {len(headers)} fields, saw {len(row)}"
                )
        df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
    except (StopIteration, csv.Error, pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
        raise IngestionFailure(f"PSA CSV row {reader.line_num}: unreadable CSV ({exc})") from exc
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
        except InvalidOperation as exc:
            skipped.append(f"row {line_number}: employed_thousands: {exc}")
            continue
        except ValidationError as exc:
            skipped.extend(
                f"row {line_number}: {'.'.join(map(str, error['loc']))}: {error['msg']}"
                for error in exc.errors(include_input=False)
            )
            continue

        key = (record.period, record.occupation_major_group, record.sector, record.region)
        if key in seen:
            skipped.append(f"row {line_number}: duplicate composite key {key} in same CSV")
            continue
        seen.add(key)
        records.append(record)

    return records, skipped


def validate_batch(raw_bytes: bytes, official_url: str,
                   publication_date: str | None = None) -> list[ChunkInput]:
    records, errors = extract_records(parse_csv(raw_bytes))
    if errors:
        raise IngestionFailure("PSA CSV validation failed; batch rejected:\n" + "\n".join(errors))
    if len(records) < MIN_RECORDS:
        raise IngestionFailure(
            f"PSA CSV requires at least {MIN_RECORDS} unique records; saw {len(records)}"
        )
    # Validate provenance for the entire batch before constructing the embedder.
    return [r.to_chunk_input(official_url, publication_date) for r in records]


def run(*, validate_only: bool = False) -> int:
    logger = None
    if not validate_only:
        cfg = IngestionConfig.from_env()
        supabase = create_client(cfg.supabase_url, cfg.supabase_service_role_key)
        logger = IngestionLogger(supabase, workflow_name=WORKFLOW_NAME)
        logger.start(silo_id=SiloId.MARKET_ANALYTICS)

    dataset_url = os.environ.get("PSA_OPENSTAT_URL", "(unset)")
    try:
        dataset_url = _require_env("PSA_OPENSTAT_URL")
        # Acquisition location is not provenance: runner paths change between executions.
        official_url = os.environ.get("PSA_SOURCE_URL") or (
            dataset_url if dataset_url.startswith("https://") else _require_env("PSA_SOURCE_URL")
        )
        chunk_inputs = validate_batch(
            download_csv(dataset_url), official_url, os.environ.get("PSA_PUBLICATION_DATE") or None
        )
    except (IngestionFailure, OSError, httpx.HTTPError, ValidationError) as exc:
        message = f"PSA batch {dataset_url}: {exc}"
        print(message)
        if logger is not None:
            logger.record(run_status="failure", error_message=message,
                          run_metadata={"dataset_url": dataset_url})
        return 1

    if validate_only:
        print(f"PSA batch {dataset_url}: validated {len(chunk_inputs)} records (no writes)")
        return 0

    repository = VectorStoreRepository(supabase)
    embedding_service = EmbeddingService(cfg)
    try:
        repository.refresh(
            chunk_inputs, SOURCE_TYPE, embedding_service,
            logger.prepare(run_metadata={"total_records": len(chunk_inputs), "dataset_url": dataset_url}),
            replace_all=True
        )
    except Exception as exc:
        logger.record(run_status="failure", error_message=f"PSA refresh failed: {exc}")
        return 1
    finally:
        embedding_service.close()

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true",
                        help="Validate CSV and provenance without credentials, embeddings, or writes")
    sys.exit(run(validate_only=parser.parse_args().validate_only))

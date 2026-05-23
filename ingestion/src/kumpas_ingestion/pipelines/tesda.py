"""Module 1.3 — Manual TESDA Cost Curation & Ingestion.

Triggered by a push to ingestion/data/tesda/programs.csv. Validates the
entire CSV, embeds every row via the shared EmbeddingService, and upserts
into the path_feasibility silo. Fail-fast: if any row is invalid, no rows
are written.

Stale rows: this pipeline never deletes. Removing a program from the CSV
does not remove it from knowledge_chunks. Cleanup is manual for MVP.
"""

from __future__ import annotations

import csv
import os
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable

from pydantic import BaseModel, Field, ValidationError, field_validator
from supabase import create_client

from ..config import IngestionConfig
from ..embedding_service import EmbeddingService
from ..ingestion_logger import IngestionLogger
from ..models import ChunkInput, KnowledgeChunk
from ..silos import SiloId
from ..vector_store_repository import VectorStoreRepository

WORKFLOW_NAME = "tesda_manual_curation"
SOURCE_TYPE = "tesda_manual"
DEFAULT_CSV_PATH = "ingestion/data/tesda/programs.csv"


class TESDARecord(BaseModel):
    program_name: str = Field(min_length=1)
    tesda_qualification_code: str = Field(min_length=1)
    program_cost_php: Decimal = Field(gt=0)
    tuition_benchmark_php: Decimal = Field(ge=0)
    source_reference: str = Field(min_length=1)

    @field_validator("program_name", "tesda_qualification_code", "source_reference")
    @classmethod
    def _strip_and_require(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned

    @property
    def source_url(self) -> str:
        return (
            f"manual_curation://tesda/{self.tesda_qualification_code}/{self.program_name}"
        )

    def to_embedding_text(self) -> str:
        return (
            f"TESDA program: {self.program_name} "
            f"(qualification code: {self.tesda_qualification_code}). "
            f"Estimated program cost: PHP {self.program_cost_php}. "
            f"Tuition benchmark: PHP {self.tuition_benchmark_php}. "
            f"Source: {self.source_reference}."
        )

    def to_chunk_input(self) -> ChunkInput:
        return ChunkInput(
            silo_id=SiloId.PATH_FEASIBILITY,
            source_url=self.source_url,
            chunk_index=0,
            content=self.to_embedding_text(),
            acquisition_method="manual_curation",
            source_metadata={
                "program_name": self.program_name,
                "tesda_qualification_code": self.tesda_qualification_code,
                "program_cost_php": str(self.program_cost_php),
                "tuition_benchmark_php": str(self.tuition_benchmark_php),
                "source_reference": self.source_reference,
            },
        )


class ValidationFailure(Exception):
    def __init__(self, errors: list[str]) -> None:
        super().__init__("CSV validation failed")
        self.errors = errors


def _resolve_csv_path() -> Path:
    override = os.environ.get("TESDA_CSV_PATH")
    if override:
        return Path(override)
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    return Path(DEFAULT_CSV_PATH)


def load_and_validate(csv_path: Path) -> list[TESDARecord]:
    if not csv_path.exists():
        raise FileNotFoundError(f"TESDA CSV not found at {csv_path}")

    records: list[TESDARecord] = []
    errors: list[str] = []
    seen_keys: set[tuple[str, str]] = set()

    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for line_number, raw_row in enumerate(reader, start=2):  # header is line 1
            try:
                record = TESDARecord.model_validate(_coerce_numeric(raw_row))
            except ValidationError as exc:
                for err in exc.errors():
                    loc = ".".join(str(p) for p in err["loc"])
                    errors.append(f"row {line_number}: {loc}: {err['msg']}")
                continue
            except (InvalidOperation, ValueError) as exc:
                errors.append(f"row {line_number}: numeric parse failure: {exc}")
                continue

            key = (record.tesda_qualification_code, record.program_name)
            if key in seen_keys:
                errors.append(
                    f"row {line_number}: duplicate (tesda_qualification_code, program_name)"
                    f" = {key} in the same CSV"
                )
                continue
            seen_keys.add(key)
            records.append(record)

    if errors:
        raise ValidationFailure(errors)
    return records


def _coerce_numeric(row: dict[str, str]) -> dict[str, object]:
    """Cast numeric strings to Decimal so Pydantic's gt/ge constraints apply."""
    coerced: dict[str, object] = dict(row)
    for field_name in ("program_cost_php", "tuition_benchmark_php"):
        if field_name in coerced and coerced[field_name] not in (None, ""):
            coerced[field_name] = Decimal(str(coerced[field_name]).strip())
    return coerced


def _print_validation_report(errors: Iterable[str]) -> None:
    print("TESDA CSV validation FAILED. Fix the rows below and push a new commit:")
    for line in errors:
        print(f"  - {line}")


def run() -> int:
    cfg = IngestionConfig.from_env()
    csv_path = _resolve_csv_path()

    supabase = create_client(cfg.supabase_url, cfg.supabase_service_role_key)
    logger = IngestionLogger(supabase, workflow_name=WORKFLOW_NAME)
    logger.start(silo_id=SiloId.PATH_FEASIBILITY)

    try:
        records = load_and_validate(csv_path)
    except ValidationFailure as exc:
        _print_validation_report(exc.errors)
        logger.record(
            run_status="failure",
            error_message=f"{len(exc.errors)} row(s) failed validation",
            run_metadata={"errors": exc.errors[:50]},
        )
        return 1
    except FileNotFoundError as exc:
        logger.record(run_status="failure", error_message=str(exc))
        print(str(exc))
        return 1

    repository = VectorStoreRepository(supabase)
    chunk_inputs = [r.to_chunk_input() for r in records]
    diff = repository.diff(chunk_inputs)

    print(
        f"TESDA diff: {len(diff.to_insert)} new, {len(diff.to_update)} changed, "
        f"{len(diff.to_skip)} unchanged"
    )

    needs_embedding = diff.to_insert + diff.to_update
    if not needs_embedding:
        log_id = logger.record(
            run_status="no_op",
            run_metadata={"total_records": len(records), "skipped": len(diff.to_skip)},
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
            "skipped": len(diff.to_skip),
        },
    )
    repository.update_ingestion_metadata(SOURCE_TYPE, log_id)
    return 0


if __name__ == "__main__":
    sys.exit(run())

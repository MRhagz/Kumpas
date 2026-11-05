"""Module 1.3 — Manual TESDA Cost Curation & Ingestion.

Triggered by a push to ingestion/data/tesda/programs.csv. Validates the
entire CSV, embeds new or changed rows via the shared EmbeddingService,
and refreshes the path_feasibility silo. An invalid batch leaves existing
knowledge records unchanged.

A fully validated semester CSV of at least 30 records replaces the TESDA source
group atomically.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sys
from collections.abc import Iterable
from contextlib import closing
from datetime import date
from decimal import Decimal
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, ValidationError, field_validator

from supabase import create_client

from ..config import IngestionConfig
from ..embedding_service import EmbeddingService
from ..ingestion_logger import IngestionLogger
from ..models import ChunkInput
from ..silos import SiloId
from ..vector_store_repository import VectorStoreRepository

WORKFLOW_NAME = "tesda_manual_curation"
SOURCE_TYPE = "tesda_manual"
DEFAULT_CSV_PATH = "ingestion/data/tesda/programs.csv"
MINIMUM_RECORDS = 30
REQUIRED_COLUMNS = {
    "program_name", "tesda_qualification_code", "provider_name", "location",
    "program_cost_php", "tuition_benchmark_php", "source_reference",
}


class TESDARecord(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)
    program_name: str = Field(min_length=1)
    tesda_qualification_code: str = Field(min_length=1)
    provider_name: str = Field(min_length=1)
    location: str = Field(min_length=1)
    program_cost_php: Decimal = Field(gt=0, allow_inf_nan=False)
    tuition_benchmark_php: Decimal = Field(ge=0, allow_inf_nan=False)
    source_reference: str = Field(min_length=1)
    qualification_level: str | None = None
    scholarship_availability: str | None = None
    publication_date: date | None = None
    official_source_url: str | None = None

    @field_validator("program_name", "tesda_qualification_code", "provider_name", "location",
                     "source_reference")
    @classmethod
    def _strip_and_require(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned

    @field_validator("official_source_url", "qualification_level",
                     "scholarship_availability", mode="before")
    @classmethod
    def _optional_provenance(cls, value: str | None) -> str | None:
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("publication_date", mode="before")
    @classmethod
    def _calendar_date(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip() or None
        if value is not None and not isinstance(value, date):
            if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                raise ValueError("must be an ISO calendar date (YYYY-MM-DD)")
            return date.fromisoformat(value)
        return value

    @field_validator("program_cost_php", "tuition_benchmark_php")
    @classmethod
    def _canonical_cost(cls, value: Decimal) -> Decimal:
        # Equivalent CSV spellings must not cause another embedding request.
        return value.normalize()

    @field_validator("official_source_url")
    @classmethod
    def _official_url(cls, value: str | None) -> str | None:
        if value is not None:
            parsed = HttpUrl(value)
            if not value.lower().startswith("https://") or parsed.username or parsed.password:
                raise ValueError("must be an official HTTPS reference without credentials")
            return str(parsed)
        return value

    @field_validator("source_reference")
    @classmethod
    def _source_reference(cls, value: str) -> str:
        if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", value):
            cls._official_url(value)
        return value

    @property
    def program_index(self) -> int:
        # Stable within the exact source reference, independent of CSV row order.
        key = json.dumps([self.tesda_qualification_code, self.program_name]).encode("utf-8")
        return int.from_bytes(hashlib.sha256(key).digest()[:4], "big") & 0x7FFF_FFFF

    def to_embedding_text(self) -> str:
        return (
            f"TESDA program: {self.program_name} "
            f"(qualification code: {self.tesda_qualification_code}). "
            f"Provider: {self.provider_name}. Location: {self.location}. "
            f"Estimated program cost: PHP {self.program_cost_php}. "
            f"Tuition benchmark: PHP {self.tuition_benchmark_php}. "
            + (f"Qualification level: {self.qualification_level}. " if self.qualification_level else "")
            + (f"Scholarship availability: {self.scholarship_availability}. "
               if self.scholarship_availability else "")
            + f"Source: {self.source_reference}."
        )

    def to_chunk_input(self) -> ChunkInput:
        return ChunkInput(
            source_type=SOURCE_TYPE,
            silo_id=SiloId.PATH_FEASIBILITY,
            source_url=self.source_reference,
            chunk_index=self.program_index,
            content=self.to_embedding_text(),
            acquisition_method="manual_curation",
            official_source_url=self.official_source_url or (
                self._official_url(self.source_reference)
                if self.source_reference.lower().startswith("https://") else None
            ),
            publication_date=self.publication_date or None,
            source_metadata={
                "program_name": self.program_name,
                "tesda_qualification_code": self.tesda_qualification_code,
                "provider_name": self.provider_name,
                "location": self.location,
                "program_cost_php": str(self.program_cost_php),
                "tuition_benchmark_php": str(self.tuition_benchmark_php),
                "source_reference": self.source_reference,
                "qualification_level": self.qualification_level,
                "scholarship_availability": self.scholarship_availability,
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
    seen_keys: set[tuple[str, int]] = set()

    with csv_path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, strict=True)
        columns = reader.fieldnames or []
        missing = sorted(REQUIRED_COLUMNS - set(columns))
        if missing:
            errors.append(f"header: missing columns: {', '.join(missing)}")
        if len(columns) != len(set(columns)):
            errors.append("header: duplicate columns")
        if errors:
            raise ValidationFailure(errors)
        for line_number, raw_row in enumerate(reader, start=2):  # header is line 1
            if None in raw_row or any(value is None for value in raw_row.values()):
                errors.append(f"row {line_number}: CSV: wrong number of fields")
                continue
            try:
                record = TESDARecord.model_validate(raw_row)
            except ValidationError as exc:
                for err in exc.errors():
                    loc = ".".join(str(p) for p in err["loc"])
                    errors.append(f"row {line_number}: {loc}: {err['msg']}")
                continue

            key = (record.source_reference, record.program_index)
            if key in seen_keys:
                errors.append(
                    f"row {line_number}: tesda_qualification_code, program_name: "
                    "duplicate program identity or chunk index within source_reference"
                )
                continue
            seen_keys.add(key)
            records.append(record)

    if len(records) < MINIMUM_RECORDS:
        errors.append(f"batch: requires at least {MINIMUM_RECORDS} valid records; found {len(records)}")
    if errors:
        raise ValidationFailure(errors)
    return records


def _print_validation_report(csv_path: Path, errors: Iterable[str]) -> None:
    print(f"TESDA CSV validation FAILED: {csv_path}. Fix the rows and push a new commit:")
    for line in errors:
        print(f"  - {line}")


def run(csv_path: Path | None = None, *, validate_only: bool = False) -> int:
    csv_path = csv_path if csv_path is not None else _resolve_csv_path()
    if validate_only:
        try:
            records = load_and_validate(csv_path)
        except ValidationFailure as exc:
            _print_validation_report(csv_path, exc.errors)
            return 1
        except (OSError, UnicodeError, csv.Error) as exc:
            print(f"TESDA CSV validation FAILED: {csv_path}: {exc}")
            return 1
        print(f"TESDA CSV validated: {csv_path}: {len(records)} records")
        return 0

    cfg = IngestionConfig.from_env()

    supabase = create_client(cfg.supabase_url, cfg.supabase_service_role_key)
    logger = IngestionLogger(supabase, workflow_name=WORKFLOW_NAME)
    logger.start(silo_id=SiloId.PATH_FEASIBILITY)
    batch_metadata = {"csv_path": str(csv_path), "acquisition_method": "manual_curation"}

    try:
        records = load_and_validate(csv_path)
    except ValidationFailure as exc:
        _print_validation_report(csv_path, exc.errors)
        logger.record(
            run_status="failure",
            error_message=f"{len(exc.errors)} validation error(s)",
            run_metadata={**batch_metadata, "errors": exc.errors[:50]},
        )
        return 1
    except (OSError, UnicodeError, csv.Error) as exc:
        logger.record(run_status="failure", error_message=str(exc), run_metadata=batch_metadata)
        print(str(exc))
        return 1

    repository = VectorStoreRepository(supabase)
    try:
        chunk_inputs = [r.to_chunk_input() for r in records]
        with closing(EmbeddingService(cfg)) as embedding_service:
            repository.refresh(
                chunk_inputs, SOURCE_TYPE, embedding_service,
                logger.prepare(run_metadata={**batch_metadata, "total_records": len(records)}),
                replace_all=True,
            )
    except Exception as exc:  # noqa: BLE001 -- workflow boundary must log provider/DB failures
        logger.record(run_status="failure", error_message=f"TESDA refresh failed: {exc}",
                      run_metadata=batch_metadata)
        return 1

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", nargs="?", default=DEFAULT_CSV_PATH)
    parser.add_argument("--validate-only", action="store_true",
                        help="Validate the semester CSV without credentials, embedding or writes")
    args = parser.parse_args()
    sys.exit(run(Path(os.environ.get("TESDA_CSV_PATH") or args.csv_path),
                 validate_only=args.validate_only))

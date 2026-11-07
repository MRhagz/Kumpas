"""Module 1.2 (DOLE BLE side) — operator-curated LMI PDF ingestion.

The approved workflow uses quarterly operator review of official public
DOLE publications. This importer reads committed files without fetching
the source URLs supplied as provenance:

  1. A team member downloads the latest BLE LMI PDF through a real
     browser.
  2. They commit the file under `ingestion/data/dole_ble/`, optionally
     adding a sidecar JSON `<stem>.meta.json` with the source URL
     and publication date for provenance.
  3. Pushing triggers ingest-dole-ble.yml, which calls this pipeline.

The pipeline reads every PDF in the directory, extracts and cleans it,
chunks/embeds, and upserts into the live_labor_demand silo with
acquisition_method='operator_curated_pdf'. Sidecar metadata, when
present, is preserved in source_metadata so the counselor-facing
freshness display can show the official BLE source URL even though the
runner only saw a local file.

Successful publications replace their earlier chunks atomically. Failed or absent
publications retain their last valid records.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
from collections.abc import Iterable
from contextlib import closing
from datetime import date
from pathlib import Path

from pydantic import BaseModel, ConfigDict, HttpUrl, ValidationError, field_validator

from supabase import ClientOptions, create_client

from ..config import IngestionConfig
from ..embedding_service import EmbeddingService
from ..ingestion_logger import IngestionLogger, run_cli
from ..models import ChunkInput
from ..pdf_downloader import PDFDownloader, PDFDownloadError
from ..pdf_text_extractor import PDFTextExtractionError, PDFTextExtractor
from ..silos import SiloId
from ..text_chunker import chunk_text
from ..text_cleaner import DOLE_BLE_PROFILE, TextCleaner
from ..vector_store_repository import VectorStoreRepository

WORKFLOW_NAME = "dole_ble_lmi_pdf"
SOURCE_TYPE = "dole_ble_lmi"
DEFAULT_DIRECTORY = "ingestion/data/dole_ble"
_logger = logging.getLogger("kumpas.ingestion.dole")


class DoleBleIngestionError(RuntimeError):
    pass


class PublicationMetadata(BaseModel):
    model_config = ConfigDict(strict=True, hide_input_in_errors=True)
    source_url: str | None = None
    publication_title: str | None = None
    publication_date: str | None = None
    release_url: str | None = None

    @field_validator("source_url", "publication_title", "publication_date", "release_url", mode="before")
    @classmethod
    def _optional_text(cls, value: object) -> object:
        return value.strip() or None if isinstance(value, str) else value

    @field_validator("source_url", "release_url")
    @classmethod
    def _https_reference(cls, value: str | None) -> str | None:
        if value is not None:
            parsed = HttpUrl(value)
            if parsed.scheme != "https" or parsed.username or parsed.password:
                raise ValueError("must be an official HTTPS reference without credentials")
        return value

    @field_validator("publication_date")
    @classmethod
    def _calendar_date(cls, value: str | None) -> str | None:
        if value is not None:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                raise ValueError("must be an ISO calendar date (YYYY-MM-DD)")
            date.fromisoformat(value)
        return value


def _resolve_directory() -> Path:
    override = os.environ.get("DOLE_BLE_DIR")
    if override:
        return Path(override)
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    return Path(DEFAULT_DIRECTORY)


def _list_pdfs(directory: Path) -> list[Path]:
    if not directory.exists():
        raise DoleBleIngestionError(f"DOLE BLE directory not found: {directory}")
    if not directory.is_dir():
        raise DoleBleIngestionError(f"Expected a directory, got: {directory}")
    try:
        # Include nested PDFs regardless of file extension casing.
        return sorted(p for p in directory.rglob("*")
                      if p.suffix.lower() == ".pdf" and (p.is_file() or p.is_symlink()))
    except OSError as exc:
        raise DoleBleIngestionError(f"Cannot list DOLE BLE directory {directory}: {exc}") from exc


def _load_sidecar(pdf_path: Path) -> dict:
    sidecar = pdf_path.with_suffix(".meta.json")
    if not sidecar.exists():
        return {}
    try:
        data = json.loads(sidecar.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise DoleBleIngestionError(
            f"Cannot read sidecar {sidecar.name}: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise DoleBleIngestionError(
            f"sidecar {sidecar.name} must be a JSON object"
        )
    return PublicationMetadata.model_validate(data).model_dump(exclude_none=True)


def _source_url_for(pdf_path: Path, sidecar: dict, relative_path: str | None = None) -> str:
    override = sidecar.get("source_url")
    if isinstance(override, str) and override.strip():
        return override.strip()
    return f"operator_curated_pdf://dole_ble/{relative_path or pdf_path.name}"


def _build_chunks(
    pdf_path: Path, source_url: str, sidecar: dict, chunks: list[str]
) -> list[ChunkInput]:
    sidecar = PublicationMetadata.model_validate(sidecar).model_dump(exclude_none=True)
    base_metadata = {
        "source_type": SOURCE_TYPE,
        "file_name": pdf_path.name,
    }
    for key in ("publication_title", "publication_date", "release_url"):
        value = sidecar.get(key)
        if isinstance(value, str) and value.strip():
            base_metadata[key] = value.strip()
    return [
        ChunkInput(
            source_type=SOURCE_TYPE,
            silo_id=SiloId.LIVE_LABOR_DEMAND,
            source_url=source_url,
            chunk_index=index,
            content=text,
            acquisition_method="operator_curated_pdf",
            official_source_url=source_url if sidecar.get("source_url") else None,
            publication_date=sidecar.get("publication_date") or None,
            source_metadata=base_metadata,
        )
        for index, text in enumerate(chunks)
    ]


def _process_pdf(
    pdf_path: Path,
    downloader: PDFDownloader,
    extractor: PDFTextExtractor,
    cleaner: TextCleaner,
    relative_path: str | None = None,
) -> list[ChunkInput]:
    if pdf_path.is_symlink():
        raise DoleBleIngestionError(f"Commit a regular PDF, not a symlink: {pdf_path.name}")
    sidecar = _load_sidecar(pdf_path)
    raw = downloader.download(pdf_path.resolve().as_uri())
    text = extractor.extract(raw)
    cleaned = cleaner.clean(text)
    chunks = chunk_text(cleaned)
    if not chunks:
        raise PDFTextExtractionError(f"no extractable text in {pdf_path.name}")
    return _build_chunks(pdf_path, _source_url_for(pdf_path, sidecar, relative_path), sidecar, chunks)


def _print_failure_report(failures: Iterable[tuple[str, str]]) -> None:
    print("DOLE BLE PDFs skipped due to per-file errors:")
    print(f"ingestion_failed count={sum(1 for _ in failures)}")


def run() -> int:
    cfg = IngestionConfig.from_env()
    directory = _resolve_directory()

    supabase = create_client(cfg.supabase_url, cfg.supabase_publishable_key,
                             options=ClientOptions(headers={"Authorization": f"Bearer {cfg.supabase_ingestion_token}"}))
    logger = IngestionLogger(supabase, workflow_name=WORKFLOW_NAME)
    logger.start(silo_id=SiloId.LIVE_LABOR_DEMAND)

    failures: list[tuple[str, str]] = []
    try:
        pdfs = _list_pdfs(directory)
        if not pdfs:
            logger.record(run_status="no_op", run_metadata={"directory": str(directory)})
            print("No public PDFs found. Logging no-op.")
            return 0

        extractor = PDFTextExtractor()
        cleaner = TextCleaner(profile=DOLE_BLE_PROFILE)
        repository = VectorStoreRepository(supabase)
        aggregated: list[ChunkInput] = []
        processed: list[Path] = []
        with closing(PDFDownloader()) as downloader:
            for pdf_path in pdfs:
                try:
                    chunks = _process_pdf(pdf_path, downloader, extractor, cleaner,
                                          pdf_path.relative_to(directory).as_posix())
                except (PDFDownloadError, PDFTextExtractionError, DoleBleIngestionError,
                        ValidationError) as exc:
                    failures.append((pdf_path.name, str(exc)))
                    logger.record(run_status="failure", error_message=str(exc), run_metadata={
                        "file": pdf_path.name, "directory": str(directory),
                    })
                    continue
                aggregated.extend(chunks)
                processed.append(pdf_path)

        if failures:
            _print_failure_report(failures)
        if not processed:
            raise DoleBleIngestionError("All DOLE BLE PDFs failed to ingest")

        with closing(EmbeddingService(cfg)) as embedding_service:
            repository.refresh(
                aggregated, SOURCE_TYPE, embedding_service, logger.prepare(run_metadata={
                    "files_processed": len(processed), "files_failed": len(failures),
                })
            )
        return 0
    except Exception as exc:  # noqa: BLE001 -- sanitize failures at the operational boundary
        _logger.error("DOLE BLE ingestion failed")
        logger.record(run_status="failure", error_message=str(exc), run_metadata={
            "directory": str(directory),
            "failures": [{"file": name, "error": error} for name, error in failures],
        })
        return 1


if __name__ == "__main__":
    sys.exit(run_cli(run))

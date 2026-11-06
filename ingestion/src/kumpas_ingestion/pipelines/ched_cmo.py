"""Module 1.2 (CHED side) — automated CHED Memorandum Order ingestion.

Scheduled GitHub Actions cron triggers this job weekly. It:
  1. asks PublicationIndexChecker for the current year's CMOs (up to a
     per-run cap; default 10) on legacy.ched.gov.ph,
  2. diffs the listed URLs against publication_index_cache,
  3. downloads each new PDF via PDFDownloader,
  4. extracts text with PDFTextExtractor (pdfplumber),
  5. cleans headers/footers with TextCleaner.CHED_PROFILE,
  6. chunks via the shared text_chunker,
  7. embeds via the shared EmbeddingService, and
  8. upserts chunks into the path_feasibility silo with
     acquisition_method='automated_pdf', then records the publication URL
     in publication_index_cache so it is not re-processed next week.

A run with zero new publications terminates as a no-op (success-no-op),
no rows changed. Per-publication download/extract failures are logged
but do not halt the run — other publications in the same batch still
ingest. This matches the SDD Alternative Flow.

DOLE BLE LMI is intentionally NOT handled here. See pipelines/dole_ble.py
and the design constraint amendment in the SDD: ble.dole.gov.ph is behind
a CDN that blocks non-browser clients (same root cause as PSA OpenSTAT).
"""

from __future__ import annotations

import logging
import os
import sys
from collections.abc import Iterable
from contextlib import closing
from datetime import UTC, datetime

from pydantic import ValidationError

from supabase import create_client

from ..config import IngestionConfig
from ..embedding_service import EmbeddingService
from ..ingestion_logger import IngestionLogger
from ..models import ChunkInput
from ..pdf_downloader import PDFDownloader, PDFDownloadError
from ..pdf_text_extractor import PDFTextExtractionError, PDFTextExtractor
from ..publication_index_checker import (
    CHED_PUBLIC_HOSTS,
    PublicationEntry,
    PublicationIndexChecker,
)
from ..silos import SiloId
from ..text_chunker import chunk_text
from ..text_cleaner import CHED_PROFILE, TextCleaner
from ..vector_store_repository import VectorStoreRepository

WORKFLOW_NAME = "ched_cmo_pdf"
SOURCE_TYPE = "ched_cmo"
DEFAULT_FIRST_RUN_LIMIT = 10
_logger = logging.getLogger("kumpas.ingestion.ched")


def _resolve_target_year() -> int:
    raw = os.environ.get("CHED_TARGET_YEAR")
    if raw:
        return int(raw)
    return datetime.now(UTC).year


def _resolve_first_run_limit() -> int:
    raw = os.environ.get("CHED_FIRST_RUN_LIMIT")
    if raw:
        value = int(raw)
        if value <= 0:
            raise ValueError("CHED_FIRST_RUN_LIMIT must be a positive integer")
        return value
    return DEFAULT_FIRST_RUN_LIMIT


def _build_chunks(
    entry: PublicationEntry, chunks: list[str]
) -> list[ChunkInput]:
    return [
        ChunkInput(
            source_type=SOURCE_TYPE,
            silo_id=SiloId.PATH_FEASIBILITY,
            source_url=entry.publication_url,
            chunk_index=index,
            content=text,
            acquisition_method="automated_pdf",
            official_source_url=entry.publication_url,
            source_metadata={
                "source_type": SOURCE_TYPE,
                "cmo_number": entry.cmo_number,
                "year": entry.year,
                "title": entry.title,
                "display_label": entry.display_label,
            },
        )
        for index, text in enumerate(chunks)
    ]


def _process_publication(
    entry: PublicationEntry,
    downloader: PDFDownloader,
    extractor: PDFTextExtractor,
    cleaner: TextCleaner,
) -> list[ChunkInput]:
    raw = downloader.download(entry.publication_url)
    text = extractor.extract(raw)
    cleaned = cleaner.clean(text)
    chunks = chunk_text(cleaned)
    if not chunks:
        raise PDFTextExtractionError(
            f"no extractable text in {entry.publication_url}"
        )
    return _build_chunks(entry, chunks)


def _embed_and_write(
    cfg: IngestionConfig,
    repository: VectorStoreRepository,
    chunk_inputs: list[ChunkInput],
    log_entry: dict,
) -> tuple[int, dict[str, int]]:
    embedding_service = EmbeddingService(cfg)
    try:
        return repository.refresh(chunk_inputs, SOURCE_TYPE, embedding_service, log_entry)
    finally:
        embedding_service.close()


def _print_failure_report(failures: Iterable[tuple[str, str]]) -> None:
    print("CHED CMO publications skipped due to per-publication errors:")
    for url, message in failures:
        print(f"  - {url}: {message}")


def run() -> int:
    cfg = IngestionConfig.from_env()
    target_year = _resolve_target_year()
    first_run_limit = _resolve_first_run_limit()

    supabase = create_client(cfg.supabase_url, cfg.supabase_service_role_key)
    logger = IngestionLogger(supabase, workflow_name=WORKFLOW_NAME)
    logger.start(silo_id=SiloId.PATH_FEASIBILITY)

    repository = VectorStoreRepository(supabase)
    failures: list[tuple[str, str]] = []
    try:
        with closing(PublicationIndexChecker()) as checker:
            all_entries = checker.list_year(target_year)
        known = repository.known_publication_urls(SOURCE_TYPE)
        new_entries = [e for e in all_entries if e.publication_url not in known]
        capped = new_entries[:first_run_limit] if not known else new_entries

        print(
            f"CHED CMO {target_year}: index={len(all_entries)} "
            f"already_ingested={len(known)} new={len(new_entries)} processing={len(capped)}"
        )
        if not capped:
            logger.record(run_status="no_op", run_metadata={
                "target_year": target_year, "index_size": len(all_entries),
                "already_ingested": len(known),
            })
            return 0

        extractor = PDFTextExtractor()
        cleaner = TextCleaner(profile=CHED_PROFILE)
        aggregated: list[ChunkInput] = []
        processed: list[PublicationEntry] = []
        with closing(PDFDownloader(allowed_hosts=CHED_PUBLIC_HOSTS)) as downloader:
            for entry in capped:
                try:
                    chunks = _process_publication(entry, downloader, extractor, cleaner)
                except (PDFDownloadError, PDFTextExtractionError, ValidationError) as exc:
                    failures.append((entry.publication_url, str(exc)))
                    logger.record(run_status="failure", error_message=str(exc), run_metadata={
                        "target_year": target_year, "publication_url": entry.publication_url,
                    })
                    continue
                aggregated.extend(chunks)
                processed.append(entry)

        if failures:
            _print_failure_report(failures)
        if not processed:
            raise PDFTextExtractionError("All CHED CMO publications failed to ingest")

        _embed_and_write(cfg, repository, aggregated, logger.prepare(run_metadata={
            "target_year": target_year, "publications_processed": len(processed),
            "publications_failed": len(failures),
        }))
        return 0
    except Exception as exc:
        _logger.exception("CHED CMO ingestion failed")
        logger.record(run_status="failure", error_message=str(exc), run_metadata={
            "target_year": target_year,
            "failures": [{"url": url, "error": error} for url, error in failures],
        })
        return 1


if __name__ == "__main__":
    sys.exit(run())

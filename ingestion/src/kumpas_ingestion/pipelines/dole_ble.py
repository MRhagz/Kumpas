"""Module 1.2 (DOLE BLE side) — operator-curated LMI PDF ingestion.

The Bureau of Local Employment publishes its Labor Market Information
PDFs through ble.dole.gov.ph, which is fronted by a CDN that returns
HTTP 403 to non-browser clients (same root cause as the PSA OpenSTAT
block that forced operator_curated_csv in Module 1.1). The automated
weekly fetch the SDD originally specified is therefore not feasible
without a browser session or a sanctioned DOLE data-sharing arrangement.

To keep ingestion moving without bypassing the block, this pipeline runs
as the DOLE-side equivalent of Module 1.1's operator-curated CSV flow:

  1. A team member downloads the latest BLE LMI PDF through a real
     browser.
  2. They commit the file under `ingestion/data/dole_ble/`, optionally
     adding a sidecar JSON `<filename>.meta.json` with the source URL
     and publication date for provenance.
  3. Pushing triggers ingest-dole-ble.yml, which calls this pipeline.

The pipeline reads every PDF in the directory, extracts and cleans it,
chunks/embeds, and upserts into the live_labor_demand silo with
acquisition_method='operator_curated_pdf'. Sidecar metadata, when
present, is preserved in source_metadata so the counselor-facing
freshness display can show the official BLE source URL even though the
runner only saw a local file.

Stale rows: this pipeline never deletes. Removing a PDF from the
directory does not remove its chunks from the silo — manual cleanup is
expected for MVP, matching Modules 1.1 and 1.3.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Iterable

from supabase import create_client

from ..config import IngestionConfig
from ..embedding_service import EmbeddingService
from ..ingestion_logger import IngestionLogger
from ..models import ChunkInput, KnowledgeChunk
from ..pdf_downloader import PDFDownloader, PDFDownloadError
from ..pdf_text_extractor import PDFTextExtractionError, PDFTextExtractor
from ..silos import SiloId
from ..text_chunker import chunk_text
from ..text_cleaner import DOLE_BLE_PROFILE, TextCleaner
from ..vector_store_repository import VectorStoreRepository

WORKFLOW_NAME = "dole_ble_lmi_pdf"
SOURCE_TYPE = "dole_ble_lmi"
DEFAULT_DIRECTORY = "ingestion/data/dole_ble"


class DoleBleIngestionError(RuntimeError):
    pass


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
    pdfs = sorted(p for p in directory.glob("*.pdf") if p.is_file())
    return pdfs


def _load_sidecar(pdf_path: Path) -> dict:
    sidecar = pdf_path.with_suffix(".meta.json")
    if not sidecar.exists():
        return {}
    try:
        data = json.loads(sidecar.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DoleBleIngestionError(
            f"sidecar {sidecar.name} is not valid JSON: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise DoleBleIngestionError(
            f"sidecar {sidecar.name} must be a JSON object"
        )
    return data


def _source_url_for(pdf_path: Path, sidecar: dict) -> str:
    override = sidecar.get("source_url")
    if isinstance(override, str) and override.strip():
        return override.strip()
    return f"operator_curated_pdf://dole_ble/{pdf_path.name}"


def _build_chunks(
    pdf_path: Path, source_url: str, sidecar: dict, chunks: list[str]
) -> list[ChunkInput]:
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
            silo_id=SiloId.LIVE_LABOR_DEMAND,
            source_url=source_url,
            chunk_index=index,
            content=text,
            acquisition_method="operator_curated_pdf",
            source_metadata=base_metadata,
        )
        for index, text in enumerate(chunks)
    ]


def _process_pdf(
    pdf_path: Path,
    downloader: PDFDownloader,
    extractor: PDFTextExtractor,
    cleaner: TextCleaner,
) -> list[ChunkInput]:
    sidecar = _load_sidecar(pdf_path)
    raw = downloader.download(f"file://{pdf_path.resolve()}")
    text = extractor.extract(raw)
    cleaned = cleaner.clean(text)
    chunks = chunk_text(cleaned)
    if not chunks:
        raise PDFTextExtractionError(f"no extractable text in {pdf_path.name}")
    return _build_chunks(pdf_path, _source_url_for(pdf_path, sidecar), sidecar, chunks)


def _print_failure_report(failures: Iterable[tuple[str, str]]) -> None:
    print("DOLE BLE PDFs skipped due to per-file errors:")
    for name, message in failures:
        print(f"  - {name}: {message}")


def run() -> int:
    cfg = IngestionConfig.from_env()
    directory = _resolve_directory()

    supabase = create_client(cfg.supabase_url, cfg.supabase_service_role_key)
    logger = IngestionLogger(supabase, workflow_name=WORKFLOW_NAME)
    logger.start(silo_id=SiloId.LIVE_LABOR_DEMAND)

    try:
        pdfs = _list_pdfs(directory)
    except DoleBleIngestionError as exc:
        logger.record(run_status="failure", error_message=str(exc))
        print(str(exc))
        return 1

    if not pdfs:
        log_id = logger.record(
            run_status="no_op",
            run_metadata={"directory": str(directory)},
        )
        repository = VectorStoreRepository(supabase)
        repository.update_ingestion_metadata(SOURCE_TYPE, log_id)
        print(f"No PDFs found in {directory}. Logging no-op.")
        return 0

    downloader = PDFDownloader()
    extractor = PDFTextExtractor()
    cleaner = TextCleaner(profile=DOLE_BLE_PROFILE)
    repository = VectorStoreRepository(supabase)

    aggregated: list[ChunkInput] = []
    processed: list[Path] = []
    failures: list[tuple[str, str]] = []
    for pdf_path in pdfs:
        try:
            chunks = _process_pdf(pdf_path, downloader, extractor, cleaner)
        except (PDFDownloadError, PDFTextExtractionError, DoleBleIngestionError) as exc:
            failures.append((pdf_path.name, str(exc)))
            continue
        aggregated.extend(chunks)
        processed.append(pdf_path)

    downloader.close()

    if failures:
        _print_failure_report(failures)

    if not processed:
        logger.record(
            run_status="failure",
            error_message="All DOLE BLE PDFs failed to ingest",
            run_metadata={
                "directory": str(directory),
                "failures": [{"file": n, "error": e} for n, e in failures[:50]],
            },
        )
        return 1

    diff = repository.diff(aggregated)
    needs_embedding = diff.to_insert + diff.to_update
    print(
        f"DOLE BLE diff: {len(diff.to_insert)} new, {len(diff.to_update)} changed, "
        f"{len(diff.to_skip)} unchanged"
    )

    if not needs_embedding:
        log_id = logger.record(
            run_status="no_op",
            run_metadata={
                "files_processed": len(processed),
                "files_failed": len(failures),
                "skipped_unchanged": len(diff.to_skip),
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
            "files_processed": len(processed),
            "files_failed": len(failures),
            "inserted": len(diff.to_insert),
            "updated": len(diff.to_update),
            "skipped_unchanged": len(diff.to_skip),
        },
    )
    repository.update_ingestion_metadata(SOURCE_TYPE, log_id)
    return 0


if __name__ == "__main__":
    sys.exit(run())

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import ExitStack, closing
from pathlib import Path
from unittest.mock import Mock, patch

from dole_fixtures import METADATA, OFFICIAL_URL, PAGES, write_publication
from kumpas_ingestion.config import IngestionConfig
from kumpas_ingestion.pdf_downloader import PDFDownloader, PDFDownloadError
from kumpas_ingestion.pdf_text_extractor import PDFTextExtractionError
from kumpas_ingestion.pipelines import dole_ble
from kumpas_ingestion.text_cleaner import DOLE_BLE_PROFILE, TextCleaner
from pydantic import ValidationError

CONFIG = IngestionConfig("https://database.example", "fixture-only", "fixture-only")


class CuratedTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def configured(self):
        stack = ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.object(dole_ble, "_resolve_directory", return_value=self.root))
        stack.enter_context(patch.object(dole_ble.IngestionConfig, "from_env", return_value=CONFIG))
        stack.enter_context(patch.object(dole_ble, "create_client", return_value=Mock()))
        logger = stack.enter_context(patch.object(dole_ble, "IngestionLogger")).return_value
        logger.prepare.return_value = {"workflow_name": "fixture", "started_at": "2026-11-05T00:00:00Z"}
        repo = stack.enter_context(patch.object(dole_ble, "VectorStoreRepository")).return_value
        repo.refresh.return_value = (1, {})
        embedder = stack.enter_context(patch.object(dole_ble, "EmbeddingService")).return_value
        return stack, logger, repo, embedder

    def test_local_file_uri_roundtrip_handles_spaces_percent_and_hash_without_http(self):
        path = write_publication(self.root, "curated report % #.pdf", METADATA)
        client = Mock()
        with closing(PDFDownloader(client)) as downloader:
            chunks = dole_ble._process_pdf(path, downloader, dole_ble.PDFTextExtractor(),
                                          TextCleaner(DOLE_BLE_PROFILE))
        client.get.assert_not_called()  # Official metadata is a reference, never a scrape target.
        for chunk in chunks:
            self.assertEqual(chunk.silo_id.value, "live_labor_demand")
            self.assertEqual(chunk.source_type, "dole_ble_lmi")
            self.assertEqual(chunk.source_url, OFFICIAL_URL)
            self.assertEqual(chunk.official_source_url, OFFICIAL_URL)
            self.assertEqual(chunk.acquisition_method, "operator_curated_pdf")
            self.assertEqual(chunk.publication_date.isoformat(), METADATA["publication_date"])
            self.assertEqual(chunk.source_metadata["publication_title"], METADATA["publication_title"])
        text = " ".join(chunk.content for chunk in chunks)
        self.assertTrue(all(f"guidance section {n}" in text for n in (1, 2, 3)))
        self.assertNotIn("Department of Labor and Employment", text)

    def test_absent_sidecar_keeps_defined_fallback_and_unknown_date(self):
        write_publication(self.root, "quarter-one/report.pdf")
        write_publication(self.root, "quarter-two/report.PDF")
        _, _, repo, _ = self.configured()
        self.assertEqual(dole_ble.run(), 0)
        chunks = repo.refresh.call_args.args[0]
        self.assertEqual({chunk.source_url for chunk in chunks}, {
            "operator_curated_pdf://dole_ble/quarter-one/report.pdf",
            "operator_curated_pdf://dole_ble/quarter-two/report.PDF",
        })
        self.assertTrue(all(chunk.official_source_url is None and chunk.publication_date is None
                            for chunk in chunks))

    def test_malformed_sidecars_are_rejected_before_extraction(self):
        path = write_publication(self.root, "report.pdf")
        variants = [[], {"publication_date": 0}, {"publication_date": "2026-02-30"},
                    {"publication_date": "2026-10-01T00:00:00Z"}, {"source_url": 1},
                    {"source_url": "file:///private.pdf"}, {"source_url": "http://ble.dole.gov.ph/lmi"},
                    {"source_url": "https://name:secret@ble.dole.gov.ph/lmi"},
                    {"publication_title": ["wrong type"]}, {"release_url": False}]
        for variant in variants:
            with self.subTest(variant=variant):
                path.with_suffix(".meta.json").write_text(json.dumps(variant), encoding="utf-8")
                with (patch.object(dole_ble.PDFTextExtractor, "extract") as extract,
                      closing(PDFDownloader()) as downloader,
                      self.assertRaises((DoleBleError, ValidationError))):
                    dole_ble._process_pdf(path, downloader, dole_ble.PDFTextExtractor(),
                                          TextCleaner(DOLE_BLE_PROFILE))
                extract.assert_not_called()
        for raw in (b"not JSON", b"\xff\xfeinvalid"):
            path.with_suffix(".meta.json").write_bytes(raw)
            with self.assertRaises(DoleBleError):
                dole_ble._load_sidecar(path)

    def test_mixed_valid_corrupt_and_bad_metadata_are_isolated_and_logged(self):
        good = write_publication(self.root, "good.pdf", METADATA)
        (self.root / "corrupt.pdf").write_bytes(b"not a PDF")
        write_publication(self.root, "invalid.pdf", {"publication_date": 123})
        _, logger, repo, _ = self.configured()
        self.assertEqual(dole_ble.run(), 0)
        self.assertEqual({chunk.source_url for chunk in repo.refresh.call_args.args[0]}, {OFFICIAL_URL})
        self.assertEqual({call.kwargs["run_metadata"]["file"] for call in logger.record.call_args_list},
                         {"corrupt.pdf", "invalid.pdf"})
        self.assertEqual(logger.prepare.call_args.kwargs["run_metadata"]["files_processed"], 1)
        self.assertTrue(good.exists())

    def test_ocr_failure_is_isolated_from_valid_text_publication(self):
        write_publication(self.root, "good.pdf", METADATA)
        write_publication(self.root, "scan.pdf", scanned=True)
        stack, logger, repo, _ = self.configured()
        stack.enter_context(patch.object(dole_ble.PDFTextExtractor, "_ocr_pdf",
                                        side_effect=PDFTextExtractionError("controlled OCR failure")))
        self.assertEqual(dole_ble.run(), 0)
        self.assertEqual({chunk.source_url for chunk in repo.refresh.call_args.args[0]}, {OFFICIAL_URL})
        self.assertEqual(logger.record.call_args.kwargs["run_metadata"]["file"], "scan.pdf")

    def test_all_failed_files_do_not_refresh_or_embed(self):
        (self.root / "broken.pdf").write_bytes(b"broken")
        _, logger, repo, embedder = self.configured()
        self.assertEqual(dole_ble.run(), 1)
        repo.refresh.assert_not_called()
        embedder.embed_documents.assert_not_called()
        self.assertEqual(logger.record.call_args.kwargs["run_status"], "failure")

    def test_empty_directory_is_true_noop_and_missing_directory_fails(self):
        stack, logger, repo, embedder = self.configured()
        self.assertEqual(dole_ble.run(), 0)
        self.assertEqual(logger.record.call_args.kwargs["run_status"], "no_op")
        repo.refresh.assert_not_called()
        embedder.embed_documents.assert_not_called()
        stack.enter_context(patch.object(dole_ble, "_resolve_directory", return_value=self.root / "missing"))
        self.assertEqual(dole_ble.run(), 1)
        self.assertEqual(logger.record.call_args.kwargs["run_status"], "failure")

    def test_local_read_errors_are_typed_and_remote_file_uris_are_rejected(self):
        with closing(PDFDownloader()) as downloader:
            for url in ((self.root / "missing.pdf").as_uri(), self.root.as_uri(),
                        "file://server/share/report.pdf"):
                with self.subTest(url=url), self.assertRaises(PDFDownloadError):
                    downloader.download(url)

    def test_cli_entrypoint_fails_with_missing_configuration(self):
        environment = {key: value for key, value in os.environ.items() if key not in {
            "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY",
        }}
        result = subprocess.run([sys.executable, "-m", "kumpas_ingestion.pipelines.dole_ble"],
                                env=environment, capture_output=True, text=True, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("required but not set", result.stderr)

    @unittest.skipUnless(os.environ.get("SW12_REQUIRE_OCR") == "1" or (
        shutil.which("tesseract") and (shutil.which("gs") or shutil.which("gswin64c"))
    ), "Real OCR requires system binaries; mandatory in DOLE CI")
    def test_real_scanned_curated_pdf(self):
        path = write_publication(self.root, "scanned.pdf", METADATA, pages=PAGES[:2], scanned=True)
        with closing(PDFDownloader()) as downloader:
            chunks = dole_ble._process_pdf(path, downloader, dole_ble.PDFTextExtractor(),
                                          TextCleaner(DOLE_BLE_PROFILE))
        text = " ".join(chunk.content for chunk in chunks).lower()
        self.assertIn("occupation group 1", text)
        self.assertIn("occupation group 2", text)
        self.assertTrue(all(chunk.publication_date.isoformat() == "2026-10-01" for chunk in chunks))


DoleBleError = dole_ble.DoleBleIngestionError

if __name__ == "__main__":
    unittest.main()

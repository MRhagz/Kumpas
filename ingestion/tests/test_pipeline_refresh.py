"""Ingestion orchestration contracts with provider, DB and PDF acquisition mocked."""
import importlib
import os
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock, patch

from pydantic import ValidationError

from test_embedding_contract import CONFIG, LOG


class PipelineRefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        importlib.import_module("pandas")
        # These tests exercise orchestration, not the PDF parser or SDK internals.
        sdk = ModuleType("supabase")
        sdk.Client, sdk.create_client = Mock, Mock()
        pdf = ModuleType("pdfplumber")
        soup = ModuleType("bs4")
        soup.BeautifulSoup = Mock()
        with patch.dict(sys.modules, {"supabase": sdk, "pdfplumber": pdf, "bs4": soup}):
            cls.psa, cls.tesda, cls.dole, cls.ched = [importlib.import_module(
                f"kumpas_ingestion.pipelines.{name}"
            ) for name in ("psa", "tesda", "dole_ble", "ched_cmo")]

    def configured(self, module):
        stack = ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.object(module.IngestionConfig, "from_env", return_value=CONFIG))
        stack.enter_context(patch.object(module, "create_client", return_value=Mock()))
        logger = stack.enter_context(patch.object(module, "IngestionLogger")).return_value
        logger.prepare.return_value = LOG
        repo = stack.enter_context(patch.object(module, "VectorStoreRepository")).return_value
        repo.refresh.return_value = (1, {})
        embedder = stack.enter_context(patch.object(module, "EmbeddingService")).return_value
        return stack, logger, repo, embedder

    def test_psa_invalid_row_rejects_whole_csv_before_embedding(self):
        module = self.psa
        stack, logger, repo, embedder = self.configured(module)
        stack.enter_context(patch.dict(os.environ, {"PSA_OPENSTAT_URL": "https://psa.gov.ph/lfs.csv"}))
        raw = ("period,occupation_major_group,sector,region,employed_thousands\n"
               "2026Q3,Professionals,Services,VII,10\n2026Q3,Clerks,Services,VII,invalid\n").encode()
        stack.enter_context(patch.object(module, "download_csv", return_value=raw))
        self.assertEqual(module.run(), 1)
        repo.refresh.assert_not_called()
        embedder.embed_documents.assert_not_called()
        self.assertEqual(logger.record.call_args.kwargs["run_status"], "failure")

    def test_psa_uses_official_url_instead_of_runner_file_for_identity(self):
        record = self.psa.OccupationRecord(period="2026Q3", occupation_major_group="Clerks",
                                           sector="Services", region="VII", employed_thousands=10)
        value = record.to_chunk_input("https://psa.gov.ph/lfs.csv")
        self.assertTrue(value.source_url.startswith("https://psa.gov.ph/lfs.csv#"))
        self.assertEqual(value.official_source_url, "https://psa.gov.ph/lfs.csv")
        self.assertIsNone(value.publication_date)

    def test_tesda_bad_provenance_reports_row_and_field_before_embedding(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "tesda.csv"
            file.write_text("program_name,tesda_qualification_code,provider_name,location,program_cost_php,"
                            "tuition_benchmark_php,source_reference,publication_date\n"
                            "Cookery,NC2,Fixture provider,Fixture location,100,100,TESDA,invalid-date\n")
            with self.assertRaises(self.tesda.ValidationFailure) as error:
                self.tesda.load_and_validate(file)
            self.assertIn("row 2: publication_date", error.exception.errors[0])

    def test_dole_sidecar_date_and_missing_provenance_remain_explicit(self):
        module = self.dole
        value = module._build_chunks(Path("report.pdf"), "https://ble.dole.gov.ph/report.pdf",
                                     {"source_url": "https://ble.dole.gov.ph/report.pdf",
                                      "publication_date": "2026-10-01"}, ["Official report"])[0]
        self.assertEqual(value.publication_date.isoformat(), "2026-10-01")
        missing = module._build_chunks(Path("report.pdf"), "operator_curated_pdf://dole/report.pdf",
                                       {}, ["Official report"])[0]
        self.assertIsNone(missing.publication_date)
        self.assertIsNone(missing.official_source_url)
        with self.assertRaises(ValidationError):
            module._build_chunks(Path("report.pdf"), value.source_url,
                                 {"publication_date": "invalid-date"}, ["Report"])

    def test_mixed_dole_publications_only_replace_successfully_validated_source(self):
        module = self.dole
        stack, logger, repo, _ = self.configured(module)
        stack.enter_context(patch.object(module, "_resolve_directory", return_value=Path("/fixtures")))
        stack.enter_context(patch.object(module, "_list_pdfs", return_value=[Path("/fixtures/good.pdf"), Path("/fixtures/bad.pdf")]))
        valid = module._build_chunks(Path("good.pdf"), "operator_curated_pdf://dole/good.pdf", {}, ["Valid"])
        stack.enter_context(patch.object(module, "_process_pdf", side_effect=[
            valid, module.PDFTextExtractionError("corrupt PDF")]))
        self.assertEqual(module.run(), 0)
        self.assertEqual(repo.refresh.call_args.args[0], valid)
        self.assertEqual(logger.prepare.call_args.kwargs["run_metadata"]["files_failed"], 1)
        self.assertEqual(logger.record.call_args.kwargs["run_status"], "failure")
        self.assertEqual(logger.record.call_args.kwargs["run_metadata"]["file"], "bad.pdf")

    def test_all_publications_fail_without_replacing_any_valid_data(self):
        module = self.dole
        stack, logger, repo, _ = self.configured(module)
        stack.enter_context(patch.object(module, "_resolve_directory", return_value=Path("/fixtures")))
        stack.enter_context(patch.object(module, "_list_pdfs", return_value=[Path("/fixtures/bad.pdf")]))
        stack.enter_context(patch.object(module, "_process_pdf", side_effect=module.PDFTextExtractionError("corrupt")))
        self.assertEqual(module.run(), 1)
        repo.refresh.assert_not_called()
        self.assertEqual(logger.record.call_args.kwargs["run_status"], "failure")

    def test_fatal_database_error_records_failure_without_success_marker(self):
        module = self.dole
        stack, logger, repo, embedder = self.configured(module)
        stack.enter_context(patch.object(module, "_resolve_directory", return_value=Path("/fixtures")))
        stack.enter_context(patch.object(module, "_list_pdfs", return_value=[Path("/fixtures/good.pdf")]))
        valid = module._build_chunks(Path("good.pdf"), "operator_curated_pdf://dole/good.pdf", {}, ["Valid"])
        stack.enter_context(patch.object(module, "_process_pdf", return_value=valid))
        repo.refresh.side_effect = RuntimeError("database transaction failed")
        self.assertEqual(module.run(), 1)
        self.assertEqual(logger.record.call_args.kwargs["run_status"], "failure")
        embedder.close.assert_called_once()

    def test_ched_unchanged_index_does_not_advance_freshness(self):
        module = self.ched
        stack, logger, repo, _ = self.configured(module)
        entry = module.PublicationEntry("https://ched.gov.ph/cmo.pdf", 1, 2026, "Official CMO")
        checker = stack.enter_context(patch.object(module, "PublicationIndexChecker")).return_value
        checker.list_year.return_value = [entry]
        repo.known_publication_urls.return_value = {entry.publication_url}
        self.assertEqual(module.run(), 0)
        repo.refresh.assert_not_called()
        self.assertEqual(logger.record.call_args.kwargs["run_status"], "no_op")


if __name__ == "__main__":
    unittest.main()

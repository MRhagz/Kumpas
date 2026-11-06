"""Exercise CHED acquisition/selection with real parsing and no external services."""
import os
import subprocess
import sys
import unittest
from contextlib import ExitStack
from unittest.mock import Mock, patch

import httpx
from kumpas_ingestion.config import IngestionConfig
from kumpas_ingestion.pdf_downloader import PDFDownloader
from kumpas_ingestion.pdf_text_extractor import PDFTextExtractionError
from kumpas_ingestion.pipelines import ched_cmo
from kumpas_ingestion.publication_index_checker import PublicationIndexChecker
from test_discovery_and_pdf import text_pdf

BASE = "https://legacy.ched.gov.ph"
CONFIG = IngestionConfig("https://database.example", "test-only", "test-only")
PUBLIC_PDF = text_pdf([["Public scholarship eligibility and career guidance. " * 2]])


class PipelineTests(unittest.TestCase):
    def test_action_entrypoint_fails_when_configuration_is_missing(self):
        environment = {key: value for key, value in os.environ.items() if key not in {
            "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY",
        }}
        result = subprocess.run([sys.executable, "-m", "kumpas_ingestion.pipelines.ched_cmo"],
                                env=environment, capture_output=True, text=True, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("required but not set", result.stderr)

    def configured(self, publications, *, known=(), responses=None, index_status=200):
        stack = ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.dict(os.environ, {
            "CHED_TARGET_YEAR": "2026", "CHED_FIRST_RUN_LIMIT": "10",
        }))
        stack.enter_context(patch.object(ched_cmo.IngestionConfig, "from_env", return_value=CONFIG))
        stack.enter_context(patch.object(ched_cmo, "create_client", return_value=Mock()))
        logger = stack.enter_context(patch.object(ched_cmo, "IngestionLogger")).return_value
        logger.prepare.return_value = {"workflow_name": "test", "started_at": "2026-11-05T00:00:00Z"}
        repo = stack.enter_context(patch.object(ched_cmo, "VectorStoreRepository")).return_value
        repo.known_publication_urls.return_value = set(known)
        repo.refresh.return_value = (1, {})
        embedder = stack.enter_context(patch.object(ched_cmo, "EmbeddingService")).return_value
        requested = []
        html = '<div class="entry-content">' + "".join(
            f'<a href="{url}">CMO No. {number}, series of 2026 – Public guidance {number}</a>'
            for number, url in publications
        ) + '</div>'
        def respond(request):
            requested.append(str(request.url))
            if request.url.path.endswith("-ched-memorandum-orders/"):
                return httpx.Response(index_status, text=html)
            return (responses or {}).get(str(request.url), httpx.Response(
                200, content=PUBLIC_PDF, headers={"content-type": "application/pdf"},
            ))
        client = httpx.Client(transport=httpx.MockTransport(respond))
        stack.callback(client.close)
        checker = PublicationIndexChecker(client)
        # Checker and downloader each own a client, as in production.
        download_client = httpx.Client(transport=httpx.MockTransport(respond))
        stack.callback(download_client.close)
        downloader = PDFDownloader(download_client, allowed_hosts=ched_cmo.CHED_PUBLIC_HOSTS)
        stack.enter_context(patch.object(ched_cmo, "PublicationIndexChecker", return_value=checker))
        stack.enter_context(patch.object(ched_cmo, "PDFDownloader", return_value=downloader))
        return stack, logger, repo, embedder, requested, client, download_client

    def test_new_publication_retains_provenance_and_uses_atomic_refresh(self):
        url = BASE + "/new.pdf"
        _, logger, repo, embedder, _, index_client, download_client = self.configured([(2, url)])
        self.assertEqual(ched_cmo.run(), 0)
        chunks, source, used_embedder, log = repo.refresh.call_args.args
        self.assertEqual(source, "ched_cmo")
        self.assertIs(used_embedder, embedder)
        self.assertEqual(log, logger.prepare.return_value)
        for chunk in chunks:
            self.assertEqual(chunk.silo_id.value, "path_feasibility")
            self.assertEqual(chunk.acquisition_method, "automated_pdf")
            self.assertEqual(chunk.source_url, url)
            self.assertEqual(chunk.official_source_url, url)
            self.assertIsNone(chunk.publication_date)  # Year does not invent a day.
            self.assertEqual(chunk.source_metadata, {
                "source_type": "ched_cmo", "cmo_number": 2, "year": 2026,
                "title": "Public guidance 2", "display_label": "CMO No. 2, s. 2026",
            })
        logger.record.assert_not_called()  # Success log/cache belong to the RPC.
        embedder.close.assert_called_once()
        self.assertTrue(index_client.is_closed and download_client.is_closed)

    def test_initial_limit_is_applied_after_discovery_and_only_with_empty_cache(self):
        entries = [(n, BASE + f"/{n}.pdf") for n in range(1, 16)]
        _, _, repo, _, requests, *_ = self.configured(entries)
        self.assertEqual(ched_cmo.run(), 0)
        self.assertEqual(len(requests) - 1, 10)
        self.assertEqual({chunk.source_metadata["cmo_number"] for chunk in repo.refresh.call_args.args[0]},
                         set(range(6, 16)))

    def test_existing_cache_is_not_limited_and_unchanged_listing_never_downloads(self):
        entries = [(n, BASE + f"/{n}.pdf") for n in range(1, 16)]
        _, _, repo, _, requests, *_ = self.configured(entries, known={entries[0][1]})
        self.assertEqual(ched_cmo.run(), 0)
        self.assertEqual(len(requests) - 1, 14)
        repo.refresh.assert_called_once()

    def test_unchanged_or_empty_listing_is_true_noop(self):
        for entries, known in [([(1, BASE + "/known.pdf")], {BASE + "/known.pdf"}), ([], set())]:
            with self.subTest(entries=entries):
                stack, logger, repo, embedder, requests, *_ = self.configured(entries, known=known)
                self.assertEqual(ched_cmo.run(), 0)
                repo.refresh.assert_not_called()
                embedder.embed_documents.assert_not_called()
                self.assertEqual(len(requests), 1)
                self.assertEqual(logger.record.call_args.kwargs["run_status"], "no_op")
                stack.close()

    def test_broken_and_corrupt_publications_are_logged_and_excluded_from_refresh(self):
        good, broken, corrupt = [BASE + name for name in ("/good.pdf", "/broken.pdf", "/corrupt.pdf")]
        _, logger, repo, _, _, *clients = self.configured(
            [(1, good), (2, broken), (3, corrupt)], responses={
                broken: httpx.Response(404),
                corrupt: httpx.Response(200, content=b"not PDF", headers={"content-type": "application/pdf"}),
            },
        )
        self.assertEqual(ched_cmo.run(), 0)
        self.assertEqual({chunk.source_url for chunk in repo.refresh.call_args.args[0]}, {good})
        self.assertEqual({call.kwargs["run_metadata"]["publication_url"]
                          for call in logger.record.call_args_list}, {broken, corrupt})
        self.assertEqual(logger.prepare.call_args.kwargs["run_metadata"]["publications_failed"], 2)
        self.assertTrue(all(client.is_closed for client in clients))

    def test_all_failed_ocr_and_unreachable_index_never_replace_prior_data(self):
        for index_status, ocr_error in [(503, None), (200, PDFTextExtractionError("OCR failed"))]:
            with self.subTest(index_status=index_status):
                stack, logger, repo, embedder, _, index_client, _ = self.configured(
                    [(1, BASE + "/retry.pdf")], index_status=index_status,
                )
                if ocr_error:
                    stack.enter_context(patch.object(ched_cmo.PDFTextExtractor, "extract", side_effect=ocr_error))
                self.assertEqual(ched_cmo.run(), 1)
                repo.refresh.assert_not_called()
                embedder.embed_documents.assert_not_called()
                self.assertEqual(logger.record.call_args.kwargs["run_status"], "failure")
                self.assertTrue(index_client.is_closed)
                stack.close()

    def test_fatal_refresh_and_cache_read_errors_report_failure_and_close_resources(self):
        for failing_method in ("known_publication_urls", "refresh"):
            with self.subTest(failing_method=failing_method):
                stack, logger, repo, embedder, _, index_client, download_client = self.configured(
                    [(1, BASE + "/retry.pdf")],
                )
                getattr(repo, failing_method).side_effect = RuntimeError("controlled database failure")
                self.assertEqual(ched_cmo.run(), 1)
                self.assertEqual(logger.record.call_args.kwargs["run_status"], "failure")
                self.assertTrue(index_client.is_closed)
                if failing_method == "refresh":
                    embedder.close.assert_called_once()
                    self.assertTrue(download_client.is_closed)
                else:
                    repo.refresh.assert_not_called()
                stack.close()


if __name__ == "__main__":
    unittest.main()

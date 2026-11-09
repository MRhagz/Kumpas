"""SW-10: actual PSA parser, CLI, and repository; external boundaries mocked."""
import os
import subprocess
import sys
import unittest
from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

import httpx
from kumpas_ingestion.pipelines import psa
from test_embedding_contract import CONFIG, LOG, database, stored

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures/psa"
OFFICIAL_URL = "https://openstat.psa.gov.ph/fixture-lfs"
ENV = {
    "PSA_OPENSTAT_URL": (FIXTURES / "valid_lfs.csv").as_uri(),
    "PSA_SOURCE_URL": OFFICIAL_URL,
    "PSA_PUBLICATION_DATE": "2026-04-15",
}


class PSATests(unittest.TestCase):
    def test_local_file_uri_decodes_spaces_and_preserves_platform_drive(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "quarter #1 data.csv"
            path.write_bytes(b"operator-curated fixture")
            self.assertEqual(psa.download_csv(path.as_uri()), path.read_bytes())
        for url in ("file://remote-host/lfs.csv", "file:///lfs.csv?query=1", "file:///lfs.csv#fragment"):
            with self.subTest(url=url), self.assertRaises(psa.IngestionFailure):
                psa.download_csv(url)

    def configured(self, raw=None):
        stack = ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.dict(os.environ, ENV, clear=True))
        stack.enter_context(patch.object(psa.IngestionConfig, "from_env", return_value=CONFIG))
        client, query = database()
        stack.enter_context(patch.object(psa, "create_client", return_value=client))
        logger = stack.enter_context(patch.object(psa, "IngestionLogger")).return_value
        logger.prepare.return_value = LOG
        factory = stack.enter_context(patch.object(psa, "EmbeddingService"))
        factory.return_value.embed_documents.side_effect = lambda texts: [[0.25] * 768 for _ in texts]
        if raw is not None:
            stack.enter_context(patch.object(psa, "download_csv", return_value=raw))
        return stack, client, query, logger, factory

    def records(self):
        return psa.extract_records(psa.parse_csv((FIXTURES / "valid_lfs.csv").read_bytes()))[0]

    def test_ten_records_reach_market_analytics_with_exact_provenance(self):
        _, client, _, _, factory = self.configured()
        self.assertEqual(psa.run(), 0)
        name, payload = client.rpc.call_args.args
        self.assertEqual(name, "refresh_knowledge_chunks")
        self.assertIsNone(payload["p_source_urls"])
        self.assertEqual(len(payload["p_chunks"]), 10)
        for record in payload["p_chunks"]:
            self.assertEqual(record["silo_id"], "market_analytics")
            self.assertEqual(record["acquisition_method"], "operator_curated_csv")
            self.assertEqual(record["official_source_url"], OFFICIAL_URL)
            self.assertEqual(record["publication_date"], "2026-04-15")
            self.assertEqual(set(record["source_metadata"]), set(psa.REQUIRED_COLUMNS) | {"dataset_url"})
            self.assertNotIn("file://", record["source_url"])
        factory.return_value.close.assert_called_once()

    def test_invalid_or_undersized_batches_fail_before_embedder_or_knowledge_writes(self):
        valid = (FIXTURES / "valid_lfs.csv").read_bytes()
        variants = [p.read_bytes() for p in FIXTURES.glob("*.csv") if p.name != "valid_lfs.csv"]
        variants += [b"", valid.splitlines()[0] + b"\n", b"\n".join(valid.splitlines()[:-1]),
                     valid + valid.splitlines()[1] + b"\n"]
        for raw in variants:
            with self.subTest(raw=raw[:70]):
                _, client, _, logger, factory = self.configured(raw)
                self.assertEqual(psa.run(), 1)
                factory.assert_not_called()
                client.rpc.assert_not_called()
                client.table.assert_not_called()
                self.assertEqual(logger.record.call_args.kwargs["run_status"], "failure")

    def test_every_invalid_field_reports_row_and_field(self):
        records, errors = psa.extract_records(psa.parse_csv((FIXTURES / "invalid_values.csv").read_bytes()))
        self.assertEqual(records, [])
        self.assertEqual(len(errors), 10)
        for row, field in enumerate(["period", "occupation_major_group", "sector", "region"] +
                                    ["employed_thousands"] * 6, start=2):
            self.assertIn(f"row {row}:", errors[row - 2])
            self.assertIn(field, errors[row - 2])

    def test_structural_errors_include_row_and_duplicate_headers_are_rejected(self):
        raw = (FIXTURES / "malformed_rows.csv").read_bytes()
        for data, message in [(raw, "row 2"),
                              (b"period,period\n2026-Q1,2026-Q1\n", "duplicate"),
                              (b'period,sector\n"unterminated', "CSV")]:
            with self.subTest(data=data), self.assertRaisesRegex(psa.IngestionFailure, message):
                psa.parse_csv(data)

    def test_text_encoding_and_decimal_precision_survive_parsing(self):
        raw = (FIXTURES / "valid_lfs.csv").read_text().replace("10.125", "10.123456789123456789")
        raw = raw.replace("Managers", "Mánagers").replace("Philippines", "NA")
        for encoding in ("utf-8-sig", "latin-1"):
            records, errors = psa.extract_records(psa.parse_csv(raw.encode(encoding)))
            self.assertFalse(errors)
            self.assertEqual(records[0].region, "NA")
            self.assertEqual(str(records[0].employed_thousands), "10.123456789123456789")

    def test_unchanged_rerun_reuses_all_vectors(self):
        _, client, query, _, factory = self.configured()
        chunks = [r.to_chunk_input(OFFICIAL_URL, ENV["PSA_PUBLICATION_DATE"]) for r in self.records()]
        query.execute.side_effect = [Mock(data=[stored(c) for c in chunks])]
        self.assertEqual(psa.run(), 0)
        factory.return_value.embed_documents.assert_not_called()
        self.assertTrue(all(c["embedding"] is None for c in client.rpc.call_args.args[1]["p_chunks"]))

    def test_extra_columns_never_reach_embeddings_or_knowledge_metadata(self):
        lines = (FIXTURES / "valid_lfs.csv").read_text().splitlines()
        raw = (lines[0] + ",unapproved_column\n" +
               "\n".join(line + ",EXCLUDED_TEST_VALUE" for line in lines[1:])).encode()
        chunks = psa.validate_batch(raw, OFFICIAL_URL)
        for chunk in chunks:
            self.assertNotIn("EXCLUDED_TEST_VALUE", chunk.model_dump_json())
            self.assertNotIn("unapproved_column", chunk.source_metadata)

    def test_provider_and_database_failures_record_failure_and_close_embedder(self):
        for boundary in ("provider", "database"):
            with self.subTest(boundary=boundary):
                _, client, _, logger, factory = self.configured()
                if boundary == "provider":
                    factory.return_value.embed_documents.side_effect = RuntimeError("provider unavailable")
                else:
                    client.rpc.return_value.execute.side_effect = RuntimeError("database rolled back")
                self.assertEqual(psa.run(), 1)
                if boundary == "provider":
                    client.rpc.assert_not_called()
                self.assertEqual(logger.record.call_args.kwargs["run_status"], "failure")
                factory.return_value.close.assert_called_once()

    def test_bad_provenance_or_unreadable_input_fails_before_embeddings(self):
        for overrides in ({"PSA_SOURCE_URL": "file:///runner/lfs.csv"},
                          {"PSA_PUBLICATION_DATE": "invalid-date"},
                          {"PSA_OPENSTAT_URL": "file:///missing-lfs.csv"}):
            with self.subTest(overrides=overrides):
                stack, client, _, logger, factory = self.configured()
                stack.enter_context(patch.dict(os.environ, overrides))
                self.assertEqual(psa.run(), 1)
                factory.assert_not_called()
                client.rpc.assert_not_called()
                self.assertEqual(logger.record.call_args.kwargs["run_status"], "failure")
        stack, client, _, logger, factory = self.configured()
        stack.enter_context(patch.object(psa, "download_csv", side_effect=httpx.ConnectError("unreachable")))
        self.assertEqual(psa.run(), 1)
        factory.assert_not_called()

    def test_validation_cli_needs_no_secrets_and_uses_the_same_contract(self):
        for filename, expected in [("valid_lfs.csv", 0), ("invalid_values.csv", 1),
                                   ("malformed_rows.csv", 1), ("missing_columns.csv", 1)]:
            env = {k: v for k, v in os.environ.items() if k not in
                   {"SUPABASE_URL", "SUPABASE_INGESTION_TOKEN", "SUPABASE_PUBLISHABLE_KEY", "GEMINI_API_KEY"}}
            env.update(ENV, PSA_OPENSTAT_URL=(FIXTURES / filename).as_uri())
            result = subprocess.run([sys.executable, "-m", "kumpas_ingestion.pipelines.psa",
                                     "--validate-only"], check=False, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
            self.assertNotIn(filename, result.stdout)
            self.assertIn("validated" if expected == 0 else "validation_failed", result.stdout)


if __name__ == "__main__":
    unittest.main()

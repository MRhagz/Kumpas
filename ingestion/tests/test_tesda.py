"""SW-13: real CSV validation and importer; no network/provider credentials."""
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

from kumpas_ingestion.pipelines import tesda
from tesda_fixtures import SOURCE, semester_rows, write_csv
from test_embedding_contract import CONFIG, LOG, database, stored


class TESDATests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.csv = write_csv(Path(temporary.name) / "semester.csv")

    def configured(self):
        stack = ExitStack()
        self.addCleanup(stack.close)
        client, query = database()
        stack.enter_context(patch.object(tesda.IngestionConfig, "from_env", return_value=CONFIG))
        stack.enter_context(patch.object(tesda, "create_client", return_value=client))
        logger = stack.enter_context(patch.object(tesda, "IngestionLogger")).return_value
        logger.prepare.return_value = LOG
        factory = stack.enter_context(patch.object(tesda, "EmbeddingService"))
        factory.return_value.embed_documents.side_effect = lambda texts: [[0.25] * 768 for _ in texts]
        return client, query, logger, factory

    def test_thirty_records_preserve_curated_public_provenance_and_optional_details(self):
        client, _, logger, factory = self.configured()
        self.assertEqual(tesda.run(self.csv), 0)
        name, payload = client.rpc.call_args.args
        self.assertEqual(name, "refresh_knowledge_chunks")
        self.assertIsNone(payload["p_source_urls"])
        self.assertEqual(len(payload["p_chunks"]), 30)
        self.assertEqual(len({(r["source_url"], r["chunk_index"]) for r in payload["p_chunks"]}), 30)
        for row in payload["p_chunks"]:
            self.assertEqual(row["source_type"], "tesda_manual")
            self.assertEqual(row["silo_id"], "path_feasibility")
            self.assertEqual(row["acquisition_method"], "manual_curation")
            self.assertEqual(row["source_url"], SOURCE)
            self.assertEqual(row["official_source_url"], SOURCE)
            self.assertEqual(row["publication_date"], "2026-06-01")
            for field in ("program_name", "tesda_qualification_code", "provider_name", "location",
                          "qualification_level", "scholarship_availability", "source_reference"):
                self.assertTrue(row["source_metadata"][field])
                self.assertIn(row["source_metadata"][field], row["content"])
        self.assertEqual(logger.prepare.call_args.kwargs["run_metadata"]["csv_path"], str(self.csv))
        factory.return_value.close.assert_called_once()

    def test_each_missing_or_blank_required_field_rejects_batch_before_embedding_or_writes(self):
        for field in sorted(tesda.REQUIRED_COLUMNS):
            for missing_column in (True, False):
                with self.subTest(field=field, missing_column=missing_column):
                    rows = semester_rows()
                    columns = list(rows[0])
                    if missing_column:
                        columns.remove(field)
                    else:
                        rows[-1][field] = "  "
                    write_csv(self.csv, rows, columns)
                    client, _, logger, factory = self.configured()
                    self.assertEqual(tesda.run(self.csv), 1)
                    factory.assert_not_called()
                    client.rpc.assert_not_called()
                    client.table.assert_not_called()
                    self.assertEqual(logger.record.call_args.kwargs["run_status"], "failure")
                    self.assertIn(field, str(logger.record.call_args.kwargs["run_metadata"]["errors"]))

    def test_invalid_costs_and_provenance_report_row_and_field(self):
        variants = {
            "program_cost_php": ["0", "-1", "NaN", "Infinity", "-Infinity", "bad", ""],
            "tuition_benchmark_php": ["-1", "NaN", "Infinity", "bad", ""],
            "publication_date": ["2026-02-30", "2026-6-1", "0", "2026-06-01T00:00:00Z"],
            "official_source_url": ["http://www.tesda.gov.ph/", "file:///costs", "bad",
                                    "https://user:secret@www.tesda.gov.ph/"],
            "source_reference": ["file:///costs", "http://www.tesda.gov.ph/"],
        }
        for field, values in variants.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    rows = semester_rows()
                    rows[2][field] = value
                    write_csv(self.csv, rows)
                    with self.assertRaises(tesda.ValidationFailure) as result:
                        tesda.load_and_validate(self.csv)
                    self.assertIn(f"row 4: {field}", str(result.exception.errors))

    def test_minimum_count_empty_duplicate_and_malformed_csv_are_rejected(self):
        for count in (0, 1, 29):
            write_csv(self.csv, semester_rows(count))
            with self.assertRaises(tesda.ValidationFailure) as result:
                tesda.load_and_validate(self.csv)
            self.assertIn("at least 30", str(result.exception.errors))
        write_csv(self.csv, semester_rows() + [semester_rows()[0]])
        with self.assertRaises(tesda.ValidationFailure) as result:
            tesda.load_and_validate(self.csv)
        self.assertIn("duplicate", str(result.exception.errors))
        valid = write_csv(self.csv).read_text(encoding="utf-8")
        for raw in ("", valid.replace("program_name,", "location,", 1), valid + "extra,fields\n",
                    valid + '"unterminated', valid.replace("program_name,", "typo,", 1)):
            with self.subTest(raw=raw[:45]):
                self.csv.write_text(raw, encoding="utf-8")
                client, _, _, factory = self.configured()
                self.assertEqual(tesda.run(self.csv), 1)
                client.rpc.assert_not_called()
                factory.assert_not_called()

    def test_unavailable_optional_provenance_stays_missing_and_numeric_spellings_are_stable(self):
        rows = semester_rows()
        for row in rows:
            row.update(publication_date=" ", official_source_url=" ", qualification_level="",
                       scholarship_availability="", source_reference="TESDA official printed fixture")
        write_csv(self.csv, rows)
        original = tesda.load_and_validate(self.csv)[0].to_chunk_input()
        self.assertIsNone(original.publication_date)
        self.assertIsNone(original.official_source_url)
        self.assertIsNone(original.source_metadata["qualification_level"])
        rows[0]["program_cost_php"] = "12500.5000"
        rows[0]["tuition_benchmark_php"] = "0.00"
        write_csv(self.csv, rows)
        self.assertEqual(tesda.load_and_validate(self.csv)[0].to_chunk_input().content_hash,
                         original.content_hash)

    def test_unchanged_records_reuse_embeddings_and_changed_record_only_embeds_once(self):
        records = tesda.load_and_validate(self.csv)
        client, query, _, factory = self.configured()
        query.execute.side_effect = None
        query.execute.return_value.data = [stored(r.to_chunk_input()) for r in records]
        self.assertEqual(tesda.run(self.csv), 0)
        factory.return_value.embed_documents.assert_not_called()
        rows = semester_rows()
        rows[0]["program_cost_php"] = "13000"
        write_csv(self.csv, rows)
        self.assertEqual(tesda.run(self.csv), 0)
        self.assertEqual(len(factory.return_value.embed_documents.call_args.args[0]), 1)
        self.assertEqual(len(client.rpc.call_args.args[1]["p_chunks"]), 30)

    def test_cli_validation_works_without_credentials_and_bad_input_is_nonzero(self):
        environment = {key: value for key, value in os.environ.items()
                       if key not in {"TESDA_CSV_PATH", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
                                      "GEMINI_API_KEY"}}
        command = [sys.executable, "-m", "kumpas_ingestion.pipelines.tesda", "--validate-only", str(self.csv)]
        result = subprocess.run(command, check=False, capture_output=True, text=True, env=environment)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("30 records", result.stdout)
        self.csv.write_bytes(b"\xff")
        result = subprocess.run(command, check=False, capture_output=True, text=True, env=environment)
        self.assertEqual(result.returncode, 1)
        self.assertIn(str(self.csv), result.stdout)


if __name__ == "__main__":
    unittest.main()

"""SW-13 importer/RPC contracts. TESDA_TEST_DATABASE_URL must be disposable.

Run supabase/tests/sw09_bootstrap.sql first. Fixture tables are reset. Only the
Supabase HTTP boundary, embeddings and failure logger are mocked, never the RPC.
"""
import os
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import Mock, patch

from kumpas_ingestion.pipelines import tesda
from tesda_fixtures import SOURCE, semester_rows, write_csv
from test_embedding_contract import CONFIG, LOG


@unittest.skipUnless(os.environ.get("TESDA_TEST_DATABASE_URL"), "needs disposable pgvector database")
class TESDADatabaseTests(unittest.TestCase):
    def setUp(self):
        import psycopg2
        from psycopg2.extras import Json, RealDictCursor

        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.csv = Path(temporary.name) / "semester.csv"
        self.catalog = semester_rows(31)
        write_csv(self.csv, self.catalog)
        self.connection = psycopg2.connect(os.environ["TESDA_TEST_DATABASE_URL"])
        self.addCleanup(self.connection.close)
        self.connection.autocommit = True
        self.cursor = self.connection.cursor(cursor_factory=RealDictCursor)
        self.addCleanup(self.cursor.close)
        self.cursor.execute("set role service_role")
        for table in ("publication_index_cache", "ingestion_metadata", "knowledge_chunks", "ingestion_logs"):
            self.cursor.execute(f"delete from public.{table}")
        self.client, query = Mock(), Mock()
        self.client.table.return_value = query
        for method in ("select", "eq", "order", "range"):
            getattr(query, method).return_value = query

        def snapshot():
            self.cursor.execute("""select silo_id, source_url, chunk_index, content_hash,
                embedding_model, embedding_dimensions from public.knowledge_chunks
                where source_type = 'tesda_manual' order by silo_id, source_url, chunk_index""")
            return Mock(data=[dict(row) for row in self.cursor.fetchall()])

        self.late_failure = False

        def refresh(name, payload):
            self.assertEqual(name, "refresh_knowledge_chunks")
            self.assertEqual(payload["p_source_type"], "tesda_manual")
            self.assertIsNone(payload["p_source_urls"])

            def execute():
                self.cursor.execute("select public.refresh_knowledge_chunks(%s,%s,%s,%s,%s)", (
                    payload["p_source_type"], None, Json(payload["p_chunks"]),
                    Json(payload["p_expected"]), Json({} if self.late_failure else payload["p_log"]),
                ))
                return Mock(data=self.cursor.fetchone()["refresh_knowledge_chunks"])
            return Mock(execute=execute)

        query.execute.side_effect = snapshot
        self.client.rpc.side_effect = refresh
        self.embedder = Mock()
        self.embedder.embed_documents.side_effect = lambda texts: [[0.25] * 768 for _ in texts]
        stack = ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.object(tesda.IngestionConfig, "from_env", return_value=CONFIG))
        stack.enter_context(patch.object(tesda, "create_client", return_value=self.client))
        self.logger = stack.enter_context(patch.object(tesda, "IngestionLogger")).return_value
        self.logger.prepare.return_value = {**LOG, "workflow_name": tesda.WORKFLOW_NAME}
        stack.enter_context(patch.object(tesda, "EmbeddingService", return_value=self.embedder))
        self.assertEqual(tesda.run(self.csv), 0)
        self.embedder.embed_documents.reset_mock()
        self.client.rpc.reset_mock()

    def rows(self, table="knowledge_chunks"):
        from psycopg2 import sql

        self.cursor.execute(sql.SQL("select to_jsonb(t) as value from public.{} t order by to_jsonb(t)::text")
                            .format(sql.Identifier(table)))
        return [row["value"] for row in self.cursor.fetchall()]

    def test_minimum_count_provenance_ingestion_date_and_path_feasibility_retrieval(self):
        rows = self.rows()
        self.assertEqual(len(rows), 31)
        for row in rows:
            self.assertEqual(row["silo_id"], "path_feasibility")
            self.assertEqual(row["source_type"], "tesda_manual")
            self.assertEqual(row["acquisition_method"], "manual_curation")
            self.assertTrue(row["source_url"].startswith(f"{SOURCE}#tesda-program="))
            self.assertEqual(row["chunk_index"], 0)
            self.assertEqual(row["official_source_url"], SOURCE)
            self.assertEqual(row["publication_date"], "2026-06-01")
            self.assertTrue(row["ingestion_timestamp"])
            for field in ("provider_name", "location", "source_reference", "qualification_level",
                          "scholarship_availability"):
                self.assertTrue(row["source_metadata"][field])
        self.cursor.execute("""select * from public.match_knowledge_chunks(
            array_fill(0.25::real, array[768])::vector, 'path_feasibility', 50)""")
        self.assertEqual(len(self.cursor.fetchall()), 31)
        self.assertEqual(self.rows("ingestion_logs")[0]["run_status"], "success")
        self.assertTrue(self.rows("ingestion_metadata")[0]["last_ingestion_timestamp"])

    def test_reordered_and_equivalent_cost_replay_reuses_vectors_and_freshness(self):
        before, freshness = self.rows(), self.rows("ingestion_metadata")
        self.catalog.reverse()
        self.catalog[0]["program_cost_php"] = "12500.5000"
        self.catalog[0]["tuition_benchmark_php"] = "0.000"
        write_csv(self.csv, self.catalog)
        self.assertEqual(tesda.run(self.csv), 0)
        self.embedder.embed_documents.assert_not_called()
        self.assertEqual(self.rows(), before)
        self.assertEqual(self.rows("ingestion_metadata"), freshness)
        self.cursor.execute("select run_status from public.ingestion_logs order by finished_at desc limit 1")
        self.assertEqual(self.cursor.fetchone()["run_status"], "no_op")

    def test_changed_new_and_superseded_rows_refresh_only_after_success(self):
        before = self.rows()
        self.catalog.pop()
        self.catalog[0]["program_cost_php"] = "13500"
        write_csv(self.csv, self.catalog)
        self.assertEqual(tesda.run(self.csv), 0)
        self.assertEqual(len(self.rows()), 30)
        self.assertEqual(len(self.embedder.embed_documents.call_args.args[0]), 1)
        self.assertEqual(sum(row in before for row in self.rows()), 29)
        self.catalog.append(semester_rows(32)[31])
        write_csv(self.csv, self.catalog)
        self.embedder.embed_documents.reset_mock()
        self.assertEqual(tesda.run(self.csv), 0)
        self.assertEqual(len(self.rows()), 31)
        self.assertEqual(len(self.embedder.embed_documents.call_args.args[0]), 1)

    def test_invalid_batches_preserve_previous_rows_logs_and_freshness_then_corrected_replay(self):
        before = {table: self.rows(table) for table in
                  ("knowledge_chunks", "ingestion_metadata", "ingestion_logs")}
        for field, value in (("program_name", ""), ("provider_name", ""), ("program_cost_php", "NaN"),
                             ("tuition_benchmark_php", "-1"), ("source_reference", "")):
            with self.subTest(field=field):
                invalid = semester_rows(31)
                invalid[0][field] = value
                write_csv(self.csv, invalid)
                self.assertEqual(tesda.run(self.csv), 1)
                self.embedder.embed_documents.assert_not_called()
                self.client.rpc.assert_not_called()
                self.assertEqual(self.logger.record.call_args.kwargs["run_status"], "failure")
                for table, expected in before.items():
                    self.assertEqual(self.rows(table), expected)
        write_csv(self.csv, self.catalog)
        self.assertEqual(tesda.run(self.csv), 0)
        self.embedder.embed_documents.assert_not_called()
        self.assertEqual(self.rows(), before["knowledge_chunks"])

    def test_provider_and_late_database_failure_roll_back_superseded_rows_and_success_markers(self):
        before = {table: self.rows(table) for table in
                  ("knowledge_chunks", "ingestion_metadata", "ingestion_logs")}
        self.catalog.pop()
        self.catalog[0]["program_cost_php"] = "13500"
        write_csv(self.csv, self.catalog)
        for boundary in ("provider", "database"):
            with self.subTest(boundary=boundary):
                self.embedder.embed_documents.side_effect = (
                    RuntimeError("controlled provider failure") if boundary == "provider" else
                    lambda texts: [[0.5] * 768 for _ in texts])
                # Missing workflow_name fails after upsert/deletion, within the RPC.
                self.late_failure = boundary == "database"
                self.assertEqual(tesda.run(self.csv), 1)
                for table, expected in before.items():
                    self.assertEqual(self.rows(table), expected)
        self.late_failure = False
        self.assertEqual(tesda.run(self.csv), 0)
        self.embedder.embed_documents.reset_mock()
        self.assertEqual(tesda.run(self.csv), 0)
        self.embedder.embed_documents.assert_not_called()
        self.assertEqual(len(self.rows()), 30)

    def test_publication_date_correction_does_not_reembed(self):
        before = {(row["source_url"], row["chunk_index"]): row for row in self.rows()}
        self.catalog[0]["publication_date"] = "2026-06-02"
        write_csv(self.csv, self.catalog)
        self.assertEqual(tesda.run(self.csv), 0)
        self.embedder.embed_documents.assert_not_called()
        corrected = [row for row in self.rows() if row["publication_date"] == "2026-06-02"]
        self.assertEqual(len(corrected), 1)
        key = (corrected[0]["source_url"], corrected[0]["chunk_index"])
        self.assertEqual(corrected[0]["embedding"], before[key]["embedding"])


if __name__ == "__main__":
    unittest.main()

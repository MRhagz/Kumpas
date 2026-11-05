"""SW-10 I08/I09/I13: production PSA pipeline and RPC in a disposable pgvector DB.

Run sw09_bootstrap.sql first. The adapter replaces only the Supabase HTTP
boundary; snapshots and the unmodified refresh transaction execute as service_role.
Never point PSA_TEST_DATABASE_URL at a deployed database: fixtures are reset.
"""
import os
import unittest
from contextlib import ExitStack
from unittest.mock import Mock, patch

from kumpas_ingestion.pipelines import psa
from test_embedding_contract import CONFIG, LOG
from test_psa import ENV, FIXTURES, OFFICIAL_URL


@unittest.skipUnless(os.environ.get("PSA_TEST_DATABASE_URL"), "needs disposable pgvector database")
class PSADatabaseTests(unittest.TestCase):
    def setUp(self):
        import psycopg2
        from psycopg2.extras import Json, RealDictCursor

        self.connection = psycopg2.connect(os.environ["PSA_TEST_DATABASE_URL"])
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
                where source_type = 'psa_openstat_lfs' order by silo_id, source_url, chunk_index""")
            return Mock(data=[dict(row) for row in self.cursor.fetchall()])

        def refresh(name, payload):
            self.assertEqual(name, "refresh_knowledge_chunks")
            self.assertIsNone(payload["p_source_urls"])
            def execute():
                self.cursor.execute("select public.refresh_knowledge_chunks(%s, %s, %s, %s, %s)", (
                    payload["p_source_type"], None, Json(payload["p_chunks"]),
                    Json(payload["p_expected"]), Json({} if self.late_failure else payload["p_log"]),
                ))
                return Mock(data=self.cursor.fetchone()["refresh_knowledge_chunks"])
            return Mock(execute=execute)

        query.execute.side_effect = snapshot
        self.client.rpc.side_effect = refresh
        self.late_failure = False
        self.embedder = Mock()
        self.embedder.embed_documents.side_effect = lambda texts: [[0.25] * 768 for _ in texts]
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.dict(os.environ, ENV))
        self.stack.enter_context(patch.object(psa.IngestionConfig, "from_env", return_value=CONFIG))
        self.stack.enter_context(patch.object(psa, "create_client", return_value=self.client))
        self.logger = self.stack.enter_context(patch.object(psa, "IngestionLogger")).return_value
        self.logger.prepare.return_value = {**LOG, "workflow_name": psa.WORKFLOW_NAME}
        self.stack.enter_context(patch.object(psa, "EmbeddingService", return_value=self.embedder))
        self.raw = (FIXTURES / "valid_lfs.csv").read_bytes()
        self.download = self.stack.enter_context(patch.object(psa, "download_csv", return_value=self.raw))
        self.assertEqual(psa.run(), 0)
        self.embedder.embed_documents.reset_mock()

    def rows(self, table="knowledge_chunks"):
        self.cursor.execute(f"select to_jsonb(t) as value from public.{table} t order by to_jsonb(t)::text")
        return [r["value"] for r in self.cursor.fetchall()]

    def test_minimum_count_provenance_and_market_retrieval(self):
        rows = self.rows()
        self.assertEqual(len(rows), 10)
        for row in rows:
            self.assertEqual(row["silo_id"], "market_analytics")
            self.assertEqual(row["official_source_url"], OFFICIAL_URL)
            self.assertEqual(row["acquisition_method"], "operator_curated_csv")
            self.assertEqual(row["publication_date"], "2026-04-15")
            self.assertTrue(row["ingestion_timestamp"])
        self.cursor.execute("""select * from public.match_knowledge_chunks(
            array_fill(0.25::real, array[768])::vector, 'market_analytics', 10)""")
        self.assertEqual(len(self.cursor.fetchall()), 10)
        self.assertEqual(self.rows("ingestion_logs")[-1]["run_status"], "success")
        self.assertTrue(self.rows("ingestion_metadata")[0]["last_ingestion_timestamp"])

    def test_rerun_reuses_vectors_and_successful_refresh_removes_only_superseded_rows(self):
        before, metadata = self.rows(), self.rows("ingestion_metadata")
        self.assertEqual(psa.run(), 0)
        self.embedder.embed_documents.assert_not_called()
        self.assertEqual(self.rows(), before)
        self.assertEqual(self.rows("ingestion_metadata"), metadata)
        self.cursor.execute("select run_status from public.ingestion_logs order by finished_at desc limit 1")
        self.assertEqual(self.cursor.fetchone()["run_status"], "no_op")
        changed = self.raw.replace(b"10.125", b"11.125").replace(
            b"Armed Forces Occupations,Services", b"Managers,Industry")
        self.download.return_value = changed
        self.assertEqual(psa.run(), 0)
        self.assertEqual(len(self.embedder.embed_documents.call_args.args[0]), 2)
        after = self.rows()
        self.assertEqual(len(after), 10)
        self.assertFalse(any("Armed Forces" in r["source_url"] for r in after))
        self.assertEqual(sum(r in before for r in after), 8)

    def test_validation_provider_and_late_write_failures_preserve_rows_and_success_markers(self):
        before = {table: self.rows(table) for table in
                  ("knowledge_chunks", "ingestion_metadata", "ingestion_logs")}
        for boundary in ("validation", "provider", "database"):
            with self.subTest(boundary=boundary):
                self.download.return_value = ((FIXTURES / "invalid_values.csv").read_bytes()
                                             if boundary == "validation" else
                                             self.raw.replace(b"10.125", b"11.125"))
                self.embedder.embed_documents.side_effect = (
                    RuntimeError("provider unavailable") if boundary == "provider" else
                    lambda texts: [[0.5] * 768 for _ in texts])
                # Missing workflow_name fails after upsert/deletion, inside the RPC.
                self.late_failure = boundary == "database"
                self.assertEqual(psa.run(), 1)
                self.assertEqual(self.logger.record.call_args.kwargs["run_status"], "failure")
                for table, expected in before.items():
                    self.assertEqual(self.rows(table), expected)
        self.late_failure = False
        self.assertEqual(psa.run(), 0)  # corrected rerun remains usable and deduplicated
        self.assertEqual(len(self.rows()), 10)


if __name__ == "__main__":
    unittest.main()

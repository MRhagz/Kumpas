"""Production DOLE pipeline and SW-09 RPC, using only a disposable pgvector DB."""
import json
import os
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import Mock, patch

from dole_fixtures import METADATA, OFFICIAL_URL, write_publication
from kumpas_ingestion.config import IngestionConfig
from kumpas_ingestion.pipelines import dole_ble


@unittest.skipUnless(os.environ.get("DOLE_TEST_DATABASE_URL"), "requires disposable PostgreSQL/pgvector")
class DoleDatabaseTests(unittest.TestCase):
    def setUp(self):
        import psycopg2
        from psycopg2.extras import Json, RealDictCursor

        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.primary = write_publication(self.root, "primary.pdf", METADATA)
        self.other_url = "https://ble.dole.gov.ph/sw12-other.pdf"
        self.other = write_publication(self.root, "other.pdf", {**METADATA, "source_url": self.other_url})
        self.connection = psycopg2.connect(os.environ["DOLE_TEST_DATABASE_URL"])
        self.addCleanup(self.connection.close)
        self.connection.autocommit = True
        self.cursor = self.connection.cursor(cursor_factory=RealDictCursor)
        self.addCleanup(self.cursor.close)
        self.cursor.execute("set role service_role")
        # The workflow supplies a fresh disposable database, never a deployed project.
        for table in ("publication_index_cache", "ingestion_metadata", "knowledge_chunks", "ingestion_logs"):
            self.cursor.execute(f"delete from public.{table}")
        self.client, query = Mock(), Mock()
        self.client.table.return_value = query
        for method in ("select", "eq", "order", "range"):
            getattr(query, method).return_value = query
        self.selected_urls = []
        def select_urls(column, values):
            self.assertEqual(column, "source_url")
            self.selected_urls = values
            return query
        query.in_.side_effect = select_urls
        def snapshot():
            self.cursor.execute("""select silo_id, source_url, chunk_index, content_hash,
                embedding_model, embedding_dimensions from public.knowledge_chunks
                where source_type = 'dole_ble_lmi' and source_url = any(%s)
                order by silo_id, source_url, chunk_index""", (self.selected_urls,))
            return Mock(data=[dict(row) for row in self.cursor.fetchall()])
        query.execute.side_effect = snapshot
        self.late_failure = False
        def refresh(name, payload):
            self.assertEqual(name, "refresh_knowledge_chunks")
            self.assertEqual(payload["p_source_type"], "dole_ble_lmi")
            self.assertIsNotNone(payload["p_source_urls"])
            def execute():
                self.cursor.execute("select public.refresh_knowledge_chunks(%s,%s,%s,%s,%s)", (
                    payload["p_source_type"], payload["p_source_urls"], Json(payload["p_chunks"]),
                    Json(payload["p_expected"]), Json({} if self.late_failure else payload["p_log"]),
                ))
                return Mock(data=self.cursor.fetchone()["refresh_knowledge_chunks"])
            return Mock(execute=execute)
        self.client.rpc.side_effect = refresh
        self.embedder = Mock()
        self.embedder.embed_documents.side_effect = lambda texts: [[0.25] * 768 for _ in texts]
        stack = ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.object(dole_ble, "_resolve_directory", return_value=self.root))
        stack.enter_context(patch.object(dole_ble.IngestionConfig, "from_env", return_value=IngestionConfig(
            "https://database.example", "fixture-only", "fixture-only")))
        stack.enter_context(patch.object(dole_ble, "create_client", return_value=self.client))
        self.logger = stack.enter_context(patch.object(dole_ble, "IngestionLogger")).return_value
        self.logger.prepare.return_value = {
            "workflow_name": dole_ble.WORKFLOW_NAME, "started_at": "2026-11-05T00:00:00Z",
        }
        stack.enter_context(patch.object(dole_ble, "EmbeddingService", return_value=self.embedder))
        self.assertEqual(dole_ble.run(), 0)
        self.embedder.embed_documents.reset_mock()

    def rows(self, table="knowledge_chunks"):
        from psycopg2 import sql

        self.cursor.execute(sql.SQL("select to_jsonb(t) as value from public.{} t order by to_jsonb(t)::text")
                            .format(sql.Identifier(table)))
        return [row["value"] for row in self.cursor.fetchall()]

    def test_provenance_ingestion_date_and_live_labor_demand_retrieval(self):
        records = self.rows()
        self.assertGreater(len(records), 2)
        for row in records:
            self.assertEqual(row["silo_id"], "live_labor_demand")
            self.assertEqual(row["acquisition_method"], "operator_curated_pdf")
            self.assertEqual(row["source_url"], row["official_source_url"])
            self.assertEqual(row["publication_date"], "2026-10-01")
            self.assertTrue(row["ingestion_timestamp"])
        self.cursor.execute("""select * from public.match_knowledge_chunks(
            array_fill(0.25::real, array[768])::vector, 'live_labor_demand', 20)""")
        self.assertEqual(len(self.cursor.fetchall()), len(records))
        self.assertEqual(self.rows("publication_index_cache"), [])  # DOLE has no CHED success cache.

    def test_replay_reuses_vectors_and_shrink_only_replaces_the_changed_publication(self):
        before, freshness = self.rows(), self.rows("ingestion_metadata")
        self.assertEqual(dole_ble.run(), 0)
        self.embedder.embed_documents.assert_not_called()
        self.assertEqual(self.rows(), before)
        self.assertEqual(self.rows("ingestion_metadata"), freshness)
        write_publication(self.root, self.primary.name, METADATA,
                          pages=["Revised public labor guidance. " * 4])
        self.assertEqual(dole_ble.run(), 0)
        self.assertEqual(len(self.embedder.embed_documents.call_args.args[0]), 1)
        after = self.rows()
        self.assertEqual(len([row for row in after if row["source_url"] == OFFICIAL_URL]), 1)
        self.assertEqual([row for row in after if row["source_url"] == self.other_url],
                         [row for row in before if row["source_url"] == self.other_url])

    def test_metadata_correction_preserves_vectors_and_updates_publication_date(self):
        changed = {**METADATA, "publication_date": "2026-10-02", "publication_title": "Corrected public title"}
        self.primary.with_suffix(".meta.json").write_text(json.dumps(changed), encoding="utf-8")
        before = {row["chunk_index"]: row for row in self.rows() if row["source_url"] == OFFICIAL_URL}
        self.assertEqual(dole_ble.run(), 0)
        self.embedder.embed_documents.assert_not_called()
        for row in self.rows():
            if row["source_url"] == OFFICIAL_URL:
                self.assertEqual(row["publication_date"], "2026-10-02")
                self.assertEqual(row["source_metadata"]["publication_title"], "Corrected public title")
                self.assertEqual(row["embedding"], before[row["chunk_index"]]["embedding"])

    def test_bad_publication_keeps_previous_data_while_valid_new_publication_commits(self):
        before = [row for row in self.rows() if row["source_url"] == OFFICIAL_URL]
        self.primary.write_bytes(b"corrupt PDF")
        new_url = "https://ble.dole.gov.ph/sw12-new.pdf"
        write_publication(self.root, "new.pdf", {**METADATA, "source_url": new_url})
        self.assertEqual(dole_ble.run(), 0)
        self.assertEqual([row for row in self.rows() if row["source_url"] == OFFICIAL_URL], before)
        self.assertTrue(any(row["source_url"] == new_url for row in self.rows()))
        self.assertEqual(self.logger.record.call_args.kwargs["run_metadata"]["file"], "primary.pdf")
        write_publication(self.root, self.primary.name, METADATA)
        self.embedder.embed_documents.reset_mock()
        self.assertEqual(dole_ble.run(), 0)
        self.embedder.embed_documents.assert_not_called()

    def test_provider_and_late_database_failures_preserve_last_valid_data(self):
        before = {table: self.rows(table) for table in
                  ("knowledge_chunks", "ingestion_metadata", "ingestion_logs")}
        write_publication(self.root, self.primary.name, METADATA, pages=["Updated public guidance. " * 4])
        for boundary in ("provider", "database"):
            with self.subTest(boundary=boundary):
                self.embedder.embed_documents.side_effect = (
                    RuntimeError("controlled provider failure") if boundary == "provider" else
                    lambda texts: [[0.5] * 768 for _ in texts])
                self.late_failure = boundary == "database"
                self.assertEqual(dole_ble.run(), 1)
                self.assertEqual(self.logger.record.call_args.kwargs["run_status"], "failure")
                for table, expected in before.items():
                    self.assertEqual(self.rows(table), expected)
        self.late_failure = False
        self.assertEqual(dole_ble.run(), 0)
        self.assertEqual(dole_ble.run(), 0)

    def test_empty_all_invalid_and_duplicate_identity_batches_do_not_erase_data(self):
        before, freshness = self.rows(), self.rows("ingestion_metadata")
        write_publication(self.root, "duplicate.pdf", METADATA)
        self.assertEqual(dole_ble.run(), 1)  # Ambiguous identity is never resolved by last-write-wins.
        self.assertEqual(self.rows(), before)
        self.embedder.embed_documents.assert_not_called()
        (self.root / "duplicate.pdf").unlink()
        self.primary.with_suffix(".meta.json").write_text('{"publication_date":0}', encoding="utf-8")
        self.other.write_bytes(b"corrupt PDF")
        self.assertEqual(dole_ble.run(), 1)
        self.assertEqual(self.rows(), before)
        self.assertEqual(self.rows("ingestion_metadata"), freshness)
        empty = self.root / "empty"
        empty.mkdir()
        with patch.object(dole_ble, "_resolve_directory", return_value=empty):
            self.assertEqual(dole_ble.run(), 0)
        self.assertEqual(self.rows(), before)
        self.assertEqual(self.rows("ingestion_metadata"), freshness)


if __name__ == "__main__":
    unittest.main()

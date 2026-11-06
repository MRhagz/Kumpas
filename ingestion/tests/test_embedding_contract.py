"""Mocked I08/I09/I13/I14 contracts; no provider keys or database required."""
import json
import os
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
from pydantic import ValidationError

from kumpas_ingestion.config import ConfigError, IngestionConfig
from kumpas_ingestion.embedding_service import EmbeddingError, EmbeddingService
from kumpas_ingestion.models import ChunkInput, KnowledgeChunk
from kumpas_ingestion.text_chunker import ChunkConfig, chunk_text
from kumpas_ingestion.vector_store_repository import VectorStoreRepository


CONFIG = IngestionConfig("https://db.example", "service-secret", "provider-secret")
LOG = {"workflow_name": "contract", "started_at": "2026-11-04T00:00:00Z"}


def chunk(index=0, content="Official source content", **overrides):
    return ChunkInput(**{
        "silo_id": "live_labor_demand", "source_type": "dole_ble_lmi",
        "source_url": "https://ble.dole.gov.ph/report.pdf", "chunk_index": index,
        "content": content, "acquisition_method": "operator_curated_pdf",
        "official_source_url": "https://ble.dole.gov.ph/report.pdf", **overrides,
    })


def stored(value, **overrides):
    return {**{k: getattr(value, k) for k in
               ("silo_id", "source_url", "chunk_index", "content_hash")},
            "embedding_model": CONFIG.embedding_model,
            "embedding_dimensions": CONFIG.embedding_dimensions, **overrides}


def database(pages=None):
    client, query = Mock(), Mock()
    client.table.return_value = query
    for method in ("select", "eq", "in_", "order", "range"):
        getattr(query, method).return_value = query
    query.execute.side_effect = [SimpleNamespace(data=p) for p in (pages or [[]])]
    client.rpc.return_value.execute.return_value = SimpleNamespace(data=1)
    return client, query


class EmbeddingContractTests(unittest.TestCase):
    def test_config_rejects_model_or_dimension_change(self):
        for options in ({"embedding_model": "text-embedding-004"}, {"embedding_dimensions": 3072}):
            with self.subTest(options=options), self.assertRaisesRegex(ConfigError, "Incompatible"):
                IngestionConfig("https://db.example", "key", "key", **options)
        with patch.dict(os.environ, {
            "SUPABASE_URL": "db", "SUPABASE_SERVICE_ROLE_KEY": "key", "GEMINI_API_KEY": "key",
            "EMBEDDING_DIMENSIONS": "invalid",
        }), self.assertRaisesRegex(ConfigError, "768"):
            IngestionConfig.from_env()

    def test_document_request_matches_approved_query_contract(self):
        captured = []
        def respond(request):
            captured.append(json.loads(request.content))
            return httpx.Response(200, json={"embedding": {"values": [0.25] * 768}})
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            vector = EmbeddingService(CONFIG, client).embed_documents(["public source"])[0]
        self.assertEqual(len(vector), 768)
        self.assertEqual(captured[0]["model"], "models/gemini-embedding-001")
        self.assertEqual(captured[0]["outputDimensionality"], 768)
        self.assertEqual(captured[0]["taskType"], "RETRIEVAL_DOCUMENT")
        ts = (Path(__file__).resolve().parents[2] / "src/lib/module3/embedding-contract.ts").read_text()
        self.assertIn(f'EMBEDDING_MODEL = "{CONFIG.embedding_model}"', ts)
        self.assertIn(f"EMBEDDING_DIMENSIONS = {CONFIG.embedding_dimensions}", ts)

    def test_provider_errors_and_invalid_vectors_are_rejected(self):
        responses = [httpx.Response(503, text="private provider body"),
                     httpx.Response(200, text="not JSON"),
                     httpx.Response(200, json={}),
                     httpx.Response(200, json={"embedding": {"values": [1] * 767}}),
                     httpx.Response(200, json={"embedding": {"values": ["1"] * 768}})]
        for response in responses:
            with self.subTest(response=response), httpx.Client(
                transport=httpx.MockTransport(lambda _: response)
            ) as client, self.assertRaises(EmbeddingError) as error:
                EmbeddingService(CONFIG, client).embed_documents(["text"])
            self.assertNotIn("private provider body", str(error.exception))
        for bad in (float("inf"), float("nan"), True):
            client = Mock()
            client.post.return_value.json.return_value = {"embedding": {"values": [bad] * 768}}
            with self.subTest(bad=bad), self.assertRaises(EmbeddingError):
                EmbeddingService(CONFIG, client).embed_documents(["text"])

    def test_provenance_keeps_unknown_dates_null_and_hash_is_not_identity(self):
        original, changed = chunk(), chunk(content="changed content")
        self.assertEqual(original.key, changed.key)
        self.assertNotEqual(original.content_hash, changed.content_hash)
        self.assertIsNone(original.model_dump(mode="json")["publication_date"])
        known = chunk(publication_date="2026-10-01")
        self.assertEqual(known.publication_date, date(2026, 10, 1))
        self.assertEqual(known.model_dump(mode="json")["publication_date"], "2026-10-01")

    def test_invalid_source_chunk_date_and_vector_are_rejected(self):
        for options in ({"chunk_index": -1}, {"source_url": " "}, {"content": " "},
                        {"silo_id": "market_analytics"}, {"publication_date": "not a date"},
                        {"official_source_url": "file:///tmp/report.pdf"},
                        {"official_source_url": "https://bad host/report.pdf"}):
            with self.subTest(options=options), self.assertRaises(ValidationError):
                chunk(**options)
        with self.assertRaises(ValidationError):
            KnowledgeChunk(**chunk().model_dump(exclude={"content_hash"}), embedding=[1] * 3)

    def test_chunker_is_deterministic_and_rejects_invalid_configuration(self):
        text = "A sentence. " * 200
        self.assertEqual(chunk_text(text), chunk_text(text))
        for cfg in (ChunkConfig(0, 0), ChunkConfig(10, -1), ChunkConfig(10, 10)):
            with self.subTest(cfg=cfg), self.assertRaises(ValueError):
                chunk_text(text, cfg)

    def test_refresh_embeds_only_changed_and_new_and_commits_once(self):
        unchanged, changed, added, removed = chunk(), chunk(1, "changed"), chunk(2, "new"), chunk(3)
        client, query = database([[stored(unchanged), stored(chunk(1)), stored(removed)]])
        embedder = Mock()
        embedder.embed_documents.return_value = [[0.5] * 768, [0.75] * 768]
        _, counts = VectorStoreRepository(client).refresh(
            [unchanged, changed, added], "dole_ble_lmi", embedder, LOG
        )
        self.assertEqual(counts, {"inserted": 1, "updated": 1, "skipped_unchanged": 1})
        embedder.embed_documents.assert_called_once_with([added.content, changed.content])
        client.rpc.assert_called_once()
        name, payload = client.rpc.call_args.args
        self.assertEqual(name, "refresh_knowledge_chunks")
        self.assertEqual(payload["p_source_urls"], [unchanged.source_url])
        self.assertEqual(len(payload["p_expected"]), 3)
        self.assertEqual(len(payload["p_chunks"]), 3)
        self.assertIsNone(payload["p_chunks"][0]["embedding"])
        self.assertEqual(payload["p_chunks"][1]["embedding_model"], "gemini-embedding-001")
        self.assertIsNone(payload["p_chunks"][0]["publication_date"])
        self.assertIn("p_log", payload)
        client.table.assert_called_once_with("knowledge_chunks")

    def test_unchanged_rerun_reuses_vectors_but_still_checks_removed_chunks(self):
        value = chunk()
        client, _ = database([[stored(value), stored(chunk(4))]])
        embedder = Mock()
        VectorStoreRepository(client).refresh([value], "dole_ble_lmi", embedder, LOG)
        embedder.embed_documents.assert_not_called()
        self.assertEqual(len(client.rpc.call_args.args[1]["p_expected"]), 2)
        self.assertIsNone(client.rpc.call_args.args[1]["p_chunks"][0]["embedding"])

    def test_unknown_legacy_model_forces_reembedding(self):
        client, _ = database([[stored(chunk(), embedding_model=None, embedding_dimensions=None)]])
        embedder = Mock()
        embedder.embed_documents.return_value = [[0.5] * 768]
        VectorStoreRepository(client).refresh([chunk()], "dole_ble_lmi", embedder, LOG)
        embedder.embed_documents.assert_called_once_with([chunk().content])

    def test_provider_failure_or_partial_invalid_result_never_calls_database_refresh(self):
        for result in (RuntimeError("provider failure"), [], [[1] * 767]):
            client, _ = database()
            embedder = Mock()
            if isinstance(result, Exception):
                embedder.embed_documents.side_effect = result
            else:
                embedder.embed_documents.return_value = result
            with self.subTest(result=type(result)), self.assertRaises((RuntimeError, ValueError)):
                VectorStoreRepository(client).refresh([chunk()], "dole_ble_lmi", embedder, LOG)
            client.rpc.assert_not_called()

    def test_database_failure_is_not_reported_as_success(self):
        client, _ = database()
        client.rpc.return_value.execute.side_effect = RuntimeError("transaction rolled back")
        embedder = Mock()
        embedder.embed_documents.return_value = [[1] * 768]
        with self.assertRaisesRegex(RuntimeError, "rolled back"):
            VectorStoreRepository(client).refresh([chunk()], "dole_ble_lmi", embedder, LOG)
        client.rpc.assert_called_once()
        self.assertEqual(client.table.call_count, 1)  # no separate success marker/cache write

    def test_duplicate_keys_and_mixed_sources_fail_before_provider_or_database(self):
        client, _ = database()
        embedder = Mock()
        for values in ([chunk(), chunk()], [chunk(source_type="ched_cmo",
                        silo_id="path_feasibility", acquisition_method="automated_pdf")]):
            with self.assertRaises(ValueError):
                VectorStoreRepository(client).refresh(values, "dole_ble_lmi", embedder, LOG)
        client.table.assert_not_called()
        embedder.embed_documents.assert_not_called()

    def test_empty_batch_never_erases_existing_source(self):
        client, _ = database()
        VectorStoreRepository(client).refresh([], "dole_ble_lmi", Mock(), LOG)
        client.rpc.assert_not_called()
        client.table.assert_not_called()

    def test_snapshot_reads_are_paginated_and_csv_scope_is_explicit(self):
        rows = [stored(chunk(i)) for i in range(501)]
        client, query = database([rows[:500], rows[500:]])
        diff = VectorStoreRepository(client).diff([chunk()], "dole_ble_lmi", replace_all=True)
        self.assertEqual(len(diff.existing), 501)
        self.assertEqual(query.range.call_args_list[1].args, (500, 999))
        query.in_.assert_not_called()

    def test_legacy_cached_publication_is_eligible_for_safe_reprocessing(self):
        client, _ = database([[{"publication_url": chunk().source_url}],
                             [{"source_url": chunk().source_url, "embedding_model": None,
                               "embedding_dimensions": None}]])
        self.assertEqual(VectorStoreRepository(client).known_publication_urls("dole_ble_lmi"), set())


if __name__ == "__main__":
    unittest.main()

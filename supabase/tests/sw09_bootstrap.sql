-- Disposable database only. Reuses the audited ingestion schema and original retrieval RPC.
create role anon;
create role authenticated;
create role service_role bypassrls;
\ir ../migrations/20260523000001_enable_pgvector.sql
\ir ../migrations/20260523000002_create_silos.sql
\ir ../migrations/20260523000003_create_knowledge_chunks.sql
\ir ../migrations/20260523000004_create_ingestion_logs.sql
\ir ../migrations/20260523000005_create_ingestion_metadata.sql
\ir ../migrations/20260523000006_create_publication_index_cache.sql
\ir ../migrations/20260523000007_grant_service_role.sql
\ir ../migrations/20260523000008_add_operator_curated_csv.sql
\ir ../migrations/20260523000009_add_operator_curated_pdf.sql
-- This fixture supplies the unrelated column touched by the original retrieval migration.
create table public.ranked_recommendations (key_signals text[]);
\ir ../migrations/20260524000003_module3_match_function_and_signals_jsonb.sql
\ir ../migrations/20261104000000_sw09_embedding_contract.sql

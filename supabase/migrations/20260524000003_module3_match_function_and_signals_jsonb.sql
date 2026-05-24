-- Module 3 — Bring local migrations in sync with production state.
--
-- 1) Adds the match_knowledge_chunks pgvector RPC consumed by
--    VectorStoreQueryService for federated silo retrieval. This function
--    existed only on the remote project and was missing from the repo.
--
-- 2) Converts ranked_recommendations.key_signals from text[] to jsonb so
--    fresh deploys match production (the column was created as jsonb by
--    the original remote migration, but the local migration defined it
--    as text[]).

alter table public.ranked_recommendations
  alter column key_signals drop default;

alter table public.ranked_recommendations
  alter column key_signals type jsonb
  using case
    when key_signals is null then '[]'::jsonb
    else to_jsonb(key_signals)
  end;

alter table public.ranked_recommendations
  alter column key_signals set default '[]'::jsonb;

create or replace function public.match_knowledge_chunks(
  query_embedding vector(768),
  target_silo_id text,
  match_count integer default 5,
  match_threshold double precision default 0.7
)
returns table (
  silo_id text,
  source_url text,
  chunk_index integer,
  content text,
  acquisition_method text,
  source_metadata jsonb,
  ingestion_timestamp timestamptz,
  similarity double precision
)
language sql stable
as $$
  select
    kc.silo_id,
    kc.source_url,
    kc.chunk_index,
    kc.content,
    kc.acquisition_method,
    kc.source_metadata,
    kc.ingestion_timestamp,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.silo_id = target_silo_id
    and 1 - (kc.embedding <=> query_embedding) > match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

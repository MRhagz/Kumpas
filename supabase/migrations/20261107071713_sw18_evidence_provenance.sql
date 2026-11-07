-- SW-18: missing dates remain unavailable; never replace them with generation time.
alter table public.recommendation_sources
  alter column ingestion_timestamp drop not null,
  alter column ingestion_timestamp drop default,
  add column publication_date date,
  add column source_url text,
  add column chunk_index integer,
  add column silo_id text;

-- Remove only the documented legacy missing-source sentinel.
update public.recommendation_sources set ingestion_timestamp = null
where ingestion_timestamp = '1970-01-01T00:00:00Z'::timestamptz;

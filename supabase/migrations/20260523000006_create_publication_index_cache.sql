create table publication_index_cache (
    publication_url text primary key,
    source_type text not null,
    first_seen_at timestamptz not null default now(),
    ingested_at timestamptz,
    ingestion_log_id uuid references ingestion_logs(log_id)
);

create index publication_index_cache_source_idx on publication_index_cache (source_type, ingested_at);

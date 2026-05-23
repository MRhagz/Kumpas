create table ingestion_metadata (
    source_type text primary key,
    last_ingestion_timestamp timestamptz,
    last_success_log_id uuid references ingestion_logs(log_id),
    updated_at timestamptz not null default now()
);

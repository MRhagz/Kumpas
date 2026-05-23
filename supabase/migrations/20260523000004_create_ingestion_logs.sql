create table ingestion_logs (
    log_id uuid primary key default gen_random_uuid(),
    workflow_name text not null,
    silo_id text references silos(silo_id),
    run_status text not null check (run_status in ('success', 'no_op', 'failure')),
    started_at timestamptz not null,
    finished_at timestamptz,
    records_upserted integer not null default 0,
    error_message text,
    run_metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index ingestion_logs_workflow_idx on ingestion_logs (workflow_name, created_at desc);
create index ingestion_logs_status_idx on ingestion_logs (run_status, created_at desc);

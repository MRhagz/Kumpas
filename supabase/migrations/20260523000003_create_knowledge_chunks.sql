create table knowledge_chunks (
    silo_id text not null references silos(silo_id),
    source_url text not null,
    chunk_index integer not null,
    content text not null,
    content_hash text not null,
    embedding vector(768) not null,
    acquisition_method text not null check (
        acquisition_method in ('automated_csv', 'automated_pdf', 'manual_curation')
    ),
    source_metadata jsonb not null default '{}'::jsonb,
    ingestion_timestamp timestamptz not null default now(),
    primary key (silo_id, source_url, chunk_index)
);

create index knowledge_chunks_embedding_idx
    on knowledge_chunks
    using hnsw (embedding vector_cosine_ops);

create index knowledge_chunks_silo_idx
    on knowledge_chunks (silo_id);

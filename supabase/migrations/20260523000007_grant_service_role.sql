-- service_role is the only client that should touch knowledge-base tables.
-- Earlier migrations did not pick up Supabase's default-privileges trigger,
-- so service_role ended up without CRUD. Grant the minimum it actually needs.

grant select, insert, update, delete on
    silos,
    knowledge_chunks,
    ingestion_logs,
    ingestion_metadata,
    publication_index_cache
to service_role;

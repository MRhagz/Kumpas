-- SW-09: legacy vectors remain unverified until refreshed; never guess their model.
-- Knowledge records are accessed only by the backend service role.
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_chunks
    add column source_type text,
    add column official_source_url text,
    add column publication_date date,
    add column embedding_model text,
    add column embedding_dimensions integer,
    add constraint knowledge_chunks_embedding_contract check (
        (embedding_model is null and embedding_dimensions is null) or
        (embedding_model is not null and embedding_dimensions is not null
         and embedding_model = 'gemini-embedding-001' and embedding_dimensions = 768)
    );

-- The old schema already identifies these source groups by silo and acquisition.
update public.knowledge_chunks set source_type = case
    when silo_id = 'market_analytics' then 'psa_openstat_lfs'
    when silo_id = 'live_labor_demand' then 'dole_ble_lmi'
    when acquisition_method = 'manual_curation' then 'tesda_manual'
    when silo_id = 'path_feasibility' then 'ched_cmo'
end;

create index knowledge_chunks_source_type_idx on public.knowledge_chunks (source_type);

create function public.refresh_knowledge_chunks(
    p_source_type text, p_source_urls text[], p_chunks jsonb, p_expected jsonb, p_log jsonb
) returns integer
language plpgsql security invoker set search_path = public, extensions, pg_temp
as $$
declare
    expected_silo text;
    expected_method text;
    current_snapshot jsonb;
    affected integer;
    removed integer;
    success_log_id uuid;
begin
    select silo, method into expected_silo, expected_method from (values
        ('psa_openstat_lfs', 'market_analytics', 'operator_curated_csv'),
        ('dole_ble_lmi', 'live_labor_demand', 'operator_curated_pdf'),
        ('ched_cmo', 'path_feasibility', 'automated_pdf'),
        ('tesda_manual', 'path_feasibility', 'manual_curation')
    ) as mapping(source, silo, method) where source = p_source_type;
    if expected_silo is null then
        raise exception 'Unknown ingestion source type';
    end if;
    if jsonb_typeof(p_chunks) is distinct from 'array'
       or jsonb_typeof(p_expected) is distinct from 'array' then
        raise exception 'Refresh requires chunk and snapshot arrays';
    end if;
    if jsonb_array_length(p_chunks) = 0 then return 0; end if;
    if p_source_urls is null and p_source_type not in ('psa_openstat_lfs', 'tesda_manual') then
        raise exception 'PDF refresh requires an explicit successful publication scope';
    end if;
    if exists (select 1 from jsonb_array_elements(p_chunks) x where
        (x->>'source_type') is distinct from p_source_type
        or (x->>'silo_id') is distinct from expected_silo
        or (x->>'acquisition_method') is distinct from expected_method
        or coalesce(btrim(x->>'source_url'), '') = ''
        or coalesce(btrim(x->>'content'), '') = ''
        or (x->>'chunk_index') is null or (x->>'chunk_index')::integer < 0
        or (x->>'content_hash') is distinct from encode(sha256(convert_to(x->>'content', 'UTF8')), 'hex')
        or (x->>'embedding_model') is distinct from 'gemini-embedding-001'
        or (x->>'embedding_dimensions') is distinct from '768'
        or jsonb_typeof(x->'source_metadata') is distinct from 'object'
        or (x->>'official_source_url' is not null and x->>'official_source_url' !~ '^https://[^/]+')
        or (p_source_urls is not null and not (x->>'source_url' = any(p_source_urls)))
    ) then raise exception 'Invalid source, chunk, provenance or embedding configuration'; end if;
    if (select count(*) from jsonb_array_elements(p_chunks)) <>
       (select count(distinct (x->>'silo_id', x->>'source_url', x->>'chunk_index'))
        from jsonb_array_elements(p_chunks) x) then
        raise exception 'Duplicate stable chunk key';
    end if;
    if p_source_urls is not null and exists (
        select 1 from unnest(p_source_urls) u where not exists (
            select 1 from jsonb_array_elements(p_chunks) x where x->>'source_url' = u
        )
    ) then raise exception 'Every refreshed publication must have valid replacement chunks'; end if;

    -- Short write lock plus snapshot check prevents a stale diff from overwriting another run.
    -- Readers remain available while the batch is committed.
    lock table public.knowledge_chunks in share row exclusive mode;
    select coalesce(jsonb_agg(jsonb_build_object(
        'silo_id', k.silo_id, 'source_url', k.source_url, 'chunk_index', k.chunk_index,
        'content_hash', k.content_hash, 'embedding_model', k.embedding_model,
        'embedding_dimensions', k.embedding_dimensions
    )), '[]'::jsonb) into current_snapshot
    from public.knowledge_chunks k where k.source_type = p_source_type
        and (p_source_urls is null or k.source_url = any(p_source_urls));
    if jsonb_array_length(current_snapshot) <> jsonb_array_length(p_expected)
       or not (current_snapshot @> p_expected and p_expected @> current_snapshot) then
        raise exception 'Knowledge source changed during embedding; retry the refresh';
    end if;
    if exists (
        select 1 from jsonb_array_elements(p_chunks) x
        join public.knowledge_chunks k on (k.silo_id, k.source_url, k.chunk_index) =
            (x->>'silo_id', x->>'source_url', (x->>'chunk_index')::integer)
        where k.source_type is distinct from p_source_type
    ) then raise exception 'Chunk identity belongs to another source group'; end if;
    if exists (
        select 1 from jsonb_array_elements(p_chunks) x
        left join public.knowledge_chunks k on (k.silo_id, k.source_url, k.chunk_index) =
            (x->>'silo_id', x->>'source_url', (x->>'chunk_index')::integer)
        where (x->>'embedding') is null and (
            k.content_hash is distinct from x->>'content_hash'
            or k.embedding_model is distinct from 'gemini-embedding-001'
            or k.embedding_dimensions is distinct from 768
        )
    ) then raise exception 'Reusable compatible vector missing; re-embed the chunk'; end if;
    if exists (
        select 1 from jsonb_array_elements(p_chunks) x
        where x->>'embedding' is not null and (
            jsonb_typeof(x->'embedding') is distinct from 'array'
            or jsonb_array_length(x->'embedding') <> 768
        )
    ) then raise exception 'Expected 768-dimensional document vector'; end if;
    if exists (
        select 1 from jsonb_array_elements(p_chunks) x,
            jsonb_array_elements(coalesce(nullif(x->'embedding', 'null'::jsonb), '[]')) v
        where jsonb_typeof(v) <> 'number'
    ) then raise exception 'Embedding values must be finite numbers'; end if;

    insert into public.knowledge_chunks as target (
        silo_id, source_type, source_url, chunk_index, content, content_hash, embedding,
        embedding_model, embedding_dimensions, acquisition_method, source_metadata,
        official_source_url, publication_date, ingestion_timestamp
    ) select x->>'silo_id', p_source_type, x->>'source_url', (x->>'chunk_index')::integer,
        x->>'content', x->>'content_hash', coalesce((x->>'embedding')::vector, k.embedding),
        'gemini-embedding-001', 768, x->>'acquisition_method', x->'source_metadata',
        x->>'official_source_url', (x->>'publication_date')::date, now()
    from jsonb_array_elements(p_chunks) x
    left join public.knowledge_chunks k on (k.silo_id, k.source_url, k.chunk_index) =
        (x->>'silo_id', x->>'source_url', (x->>'chunk_index')::integer)
    on conflict (silo_id, source_url, chunk_index) do update set
        source_type = excluded.source_type, content = excluded.content,
        content_hash = excluded.content_hash, embedding = excluded.embedding,
        embedding_model = excluded.embedding_model, embedding_dimensions = excluded.embedding_dimensions,
        acquisition_method = excluded.acquisition_method, source_metadata = excluded.source_metadata,
        official_source_url = excluded.official_source_url, publication_date = excluded.publication_date,
        ingestion_timestamp = excluded.ingestion_timestamp
    where (target.content_hash, target.embedding_model, target.embedding_dimensions,
           target.source_type, target.acquisition_method, target.source_metadata,
           target.official_source_url, target.publication_date) is distinct from
          (excluded.content_hash, excluded.embedding_model, excluded.embedding_dimensions,
           excluded.source_type, excluded.acquisition_method, excluded.source_metadata,
           excluded.official_source_url, excluded.publication_date);
    get diagnostics affected = row_count;

    delete from public.knowledge_chunks k where k.source_type = p_source_type
        and (p_source_urls is null or k.source_url = any(p_source_urls))
        and not exists (select 1 from jsonb_array_elements(p_chunks) x where
            (k.silo_id, k.source_url, k.chunk_index) =
            (x->>'silo_id', x->>'source_url', (x->>'chunk_index')::integer));
    get diagnostics removed = row_count;
    insert into public.ingestion_logs (
        workflow_name, silo_id, run_status, started_at, finished_at,
        records_upserted, run_metadata
    ) values (
        p_log->>'workflow_name', expected_silo,
        case when affected + removed > 0 then 'success' else 'no_op' end,
        (p_log->>'started_at')::timestamptz, now(), affected,
        coalesce(p_log->'run_metadata', '{}'::jsonb) || jsonb_build_object('removed', removed)
    ) returning log_id into success_log_id;
    if affected + removed > 0 then
        insert into public.ingestion_metadata (
            source_type, last_ingestion_timestamp, last_success_log_id, updated_at
        ) values (p_source_type, now(), success_log_id, now())
        on conflict (source_type) do update set
            last_ingestion_timestamp = excluded.last_ingestion_timestamp,
            last_success_log_id = excluded.last_success_log_id, updated_at = excluded.updated_at;
    end if;
    if p_source_type = 'ched_cmo' then
        insert into public.publication_index_cache (
            publication_url, source_type, ingested_at, ingestion_log_id
        ) select distinct x->>'source_url', p_source_type, now(), success_log_id
        from jsonb_array_elements(p_chunks) x
        on conflict (publication_url) do nothing;
    end if;
    return affected + removed;
end;
$$;
revoke all on function public.refresh_knowledge_chunks(text, text[], jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.refresh_knowledge_chunks(text, text[], jsonb, jsonb, jsonb) to service_role;

-- Replace the old RPC rather than leaving an unguarded overload available.
drop function public.match_knowledge_chunks(vector, text, integer, double precision);
create function public.match_knowledge_chunks(
    query_embedding vector(768), target_silo_id text,
    match_count integer default 5, match_threshold double precision default 0.7,
    query_model text default 'gemini-embedding-001', query_dimensions integer default 768
) returns table (
    silo_id text, source_url text, chunk_index integer, content text,
    acquisition_method text, source_metadata jsonb, ingestion_timestamp timestamptz,
    similarity double precision, source_type text, official_source_url text,
    publication_date date, embedding_model text, embedding_dimensions integer
)
language plpgsql stable security invoker set search_path = public, extensions, pg_temp
as $$
begin
    if query_model is distinct from 'gemini-embedding-001' or query_dimensions is distinct from 768
       or query_embedding is null or vector_dims(query_embedding) <> 768 then
        raise exception 'Incompatible query embedding: require gemini-embedding-001 / 768';
    end if;
    if exists (select 1 from public.knowledge_chunks k where k.silo_id = target_silo_id and (
        k.embedding_model is distinct from query_model or k.embedding_dimensions is distinct from query_dimensions
    )) then
        raise exception 'Unverified or incompatible stored embeddings; refresh this silo before retrieval';
    end if;
    return query select k.silo_id, k.source_url, k.chunk_index, k.content,
        k.acquisition_method, k.source_metadata, k.ingestion_timestamp,
        1 - (k.embedding <=> query_embedding), k.source_type, k.official_source_url,
        k.publication_date, k.embedding_model, k.embedding_dimensions
    from public.knowledge_chunks k where k.silo_id = target_silo_id
        and 1 - (k.embedding <=> query_embedding) > match_threshold
    order by k.embedding <=> query_embedding limit match_count;
end;
$$;
revoke all on function public.match_knowledge_chunks(vector, text, integer, double precision, text, integer)
    from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(vector, text, integer, double precision, text, integer)
    to service_role;

-- Disposable database only, after sw09_bootstrap.sql. All fixtures roll back.
begin;

create function pg_temp.sw11_chunk(url text, idx integer, body text, vector_json jsonb)
returns jsonb language sql as $$
    select jsonb_build_object(
        'silo_id', 'path_feasibility', 'source_type', 'ched_cmo', 'source_url', url,
        'chunk_index', idx, 'content', body,
        'content_hash', encode(sha256(convert_to(body, 'UTF8')), 'hex'),
        'embedding', vector_json, 'embedding_model', 'gemini-embedding-001',
        'embedding_dimensions', 768, 'acquisition_method', 'automated_pdf',
        'official_source_url', url, 'publication_date', null,
        'source_metadata', jsonb_build_object('title', 'Synthetic public CMO', 'year', 2026)
    );
$$;
create function pg_temp.sw11_snapshot() returns jsonb language sql as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'silo_id', k.silo_id, 'source_url', k.source_url, 'chunk_index', k.chunk_index,
        'content_hash', k.content_hash, 'embedding_model', k.embedding_model,
        'embedding_dimensions', k.embedding_dimensions
    ) order by k.source_url, k.chunk_index), '[]'::jsonb)
    from public.knowledge_chunks k where k.source_type = 'ched_cmo';
$$;
create function pg_temp.sw11_reject_cache() returns trigger language plpgsql as $$
begin
    if current_setting('sw11.reject_cache', true) = 'on' and
        new.publication_url = 'https://legacy.ched.gov.ph/sw11-failed.pdf' then
        raise exception 'fixture cache failure';
    end if;
    return new;
end;
$$;
create trigger sw11_cache_failure before insert on public.publication_index_cache
for each row execute function pg_temp.sw11_reject_cache();

set local role service_role;
do $$
declare
    source text := 'https://legacy.ched.gov.ph/sw11-original.pdf';
    retry_source text := 'https://legacy.ched.gov.ph/sw11-failed.pdf';
    vector_json jsonb := to_jsonb(array_fill(0.25::real, array[768]));
    run_log jsonb := jsonb_build_object('workflow_name', 'sw11_contract', 'started_at', now());
    inputs jsonb;
    records_before jsonb;
    cache_before jsonb;
    freshness_before jsonb;
    logs_before bigint;
    failed boolean := false;
    affected integer;
begin
    perform public.refresh_knowledge_chunks('ched_cmo', array[source], jsonb_build_array(
        pg_temp.sw11_chunk(source, 0, 'Original public scholarship rule', vector_json),
        pg_temp.sw11_chunk(source, 1, 'Old extra chunk', vector_json)
    ), '[]', run_log);
    if (select count(*) from public.publication_index_cache where publication_url = source) <> 1
       or exists (select 1 from public.knowledge_chunks where source_url = source and
           (silo_id <> 'path_feasibility' or acquisition_method <> 'automated_pdf'
            or official_source_url <> source or publication_date is not null))
    then raise exception 'I08 CHED routing/provenance/success cache failed'; end if;

    select jsonb_agg(to_jsonb(k) order by source_url, chunk_index) into records_before
        from public.knowledge_chunks k where source_type = 'ched_cmo';
    select jsonb_agg(to_jsonb(c) order by publication_url) into cache_before
        from public.publication_index_cache c where source_type = 'ched_cmo';
    select to_jsonb(m) into freshness_before from public.ingestion_metadata m
        where source_type = 'ched_cmo';
    select count(*) into logs_before from public.ingestion_logs;

    inputs := jsonb_build_array(
        pg_temp.sw11_chunk(source, 0, 'Replacement public rule', vector_json),
        pg_temp.sw11_chunk(retry_source, 0, 'New public CMO', vector_json)
    );
    perform set_config('sw11.reject_cache', 'on', true);
    begin
        -- Cache insert is the final operation, after upsert, deletion, log and freshness.
        perform public.refresh_knowledge_chunks('ched_cmo', array[source, retry_source],
            inputs, pg_temp.sw11_snapshot(), run_log);
    exception when raise_exception then
        if sqlerrm <> 'fixture cache failure' then raise; end if;
        failed := true;
    end;
    if not failed or (select jsonb_agg(to_jsonb(k) order by source_url, chunk_index)
        from public.knowledge_chunks k where source_type = 'ched_cmo') is distinct from records_before
       or (select jsonb_agg(to_jsonb(c) order by publication_url)
           from public.publication_index_cache c where source_type = 'ched_cmo') is distinct from cache_before
       or (select to_jsonb(m) from public.ingestion_metadata m where source_type = 'ched_cmo')
           is distinct from freshness_before
       or (select count(*) from public.ingestion_logs) <> logs_before
    then raise exception 'I09 cache failure did not roll back records and success markers'; end if;

    perform set_config('sw11.reject_cache', 'off', true);
    affected := public.refresh_knowledge_chunks('ched_cmo', array[source, retry_source],
        inputs, pg_temp.sw11_snapshot(), run_log);
    if affected <> 3 or (select count(*) from public.publication_index_cache
        where publication_url in (source, retry_source)) <> 2
       or exists (select 1 from public.knowledge_chunks where source_url = source and chunk_index = 1)
    then raise exception 'I13 corrected retry did not replace superseded data/cache successfully'; end if;

    -- Distinct timestamps make a false freshness update detectable within one transaction.
    update public.ingestion_metadata set last_ingestion_timestamp = '2000-01-01T00:00:00Z'
        where source_type = 'ched_cmo';
    select to_jsonb(m) into freshness_before from public.ingestion_metadata m where source_type = 'ched_cmo';
    select jsonb_agg(to_jsonb(c) order by publication_url) into cache_before
        from public.publication_index_cache c where source_type = 'ched_cmo';
    inputs := jsonb_build_array(
        pg_temp.sw11_chunk(source, 0, 'Replacement public rule', null),
        pg_temp.sw11_chunk(retry_source, 0, 'New public CMO', null)
    );
    affected := public.refresh_knowledge_chunks('ched_cmo', array[source, retry_source],
        inputs, pg_temp.sw11_snapshot(), run_log);
    if affected <> 0 or (select count(*) from public.knowledge_chunks where source_type = 'ched_cmo') <> 2
       or (select to_jsonb(m) from public.ingestion_metadata m where source_type = 'ched_cmo')
           is distinct from freshness_before
       or (select jsonb_agg(to_jsonb(c) order by publication_url)
           from public.publication_index_cache c where source_type = 'ched_cmo') is distinct from cache_before
    then raise exception 'I08/I13 unchanged replay duplicated data or advanced success markers'; end if;
end;
$$;
rollback;

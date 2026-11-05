-- Run after the SW-09 migration in an isolated Supabase/pgvector database:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sw09_embedding_contract.sql
-- All fixtures and success markers are rolled back.
begin;

create function pg_temp.sw09_chunk(url text, idx integer, body text, values_json jsonb)
returns jsonb language sql as $$
    select jsonb_build_object(
        'silo_id', 'live_labor_demand', 'source_type', 'dole_ble_lmi',
        'source_url', url, 'chunk_index', idx, 'content', body,
        'content_hash', encode(sha256(convert_to(body, 'UTF8')), 'hex'),
        'embedding', values_json, 'embedding_model', 'gemini-embedding-001',
        'embedding_dimensions', 768, 'acquisition_method', 'operator_curated_pdf',
        'official_source_url', url, 'publication_date', null, 'source_metadata', '{}'::jsonb
    );
$$;
create function pg_temp.sw09_snapshot(url text) returns jsonb language sql as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'silo_id', k.silo_id, 'source_url', k.source_url, 'chunk_index', k.chunk_index,
        'content_hash', k.content_hash, 'embedding_model', k.embedding_model,
        'embedding_dimensions', k.embedding_dimensions
    )), '[]'::jsonb) from public.knowledge_chunks k where k.source_url = url;
$$;

-- Exercise the invoker RPCs with the same role used by ingestion/retrieval.
set local role service_role;

do $$
declare
    source text := 'https://ble.dole.gov.ph/sw09-contract-test.pdf';
    unrelated text := 'https://ble.dole.gov.ph/sw09-unrelated-test.pdf';
    vector_json jsonb := to_jsonb(array_fill(0.25::real, array[768]));
    run_log jsonb := jsonb_build_object('workflow_name', 'sw09_contract', 'started_at', now());
    inputs jsonb;
    previous jsonb;
    previous_metadata jsonb;
    previous_logs bigint;
    changed integer;
    old_timestamp timestamptz;
    failed boolean;
begin
    if not (select relrowsecurity from pg_class where oid = 'public.knowledge_chunks'::regclass)
    then raise exception 'Knowledge table RLS is disabled'; end if;
    if has_function_privilege('anon',
        'public.refresh_knowledge_chunks(text,text[],jsonb,jsonb,jsonb)', 'execute')
       or has_function_privilege('authenticated',
        'public.match_knowledge_chunks(vector,text,integer,double precision,text,integer)', 'execute')
    then raise exception 'Privileged knowledge RPC exposed to a counselor/public role'; end if;
    inputs := jsonb_build_array(
        pg_temp.sw09_chunk(source, 0, 'unchanged', vector_json),
        pg_temp.sw09_chunk(source, 1, 'old', vector_json),
        pg_temp.sw09_chunk(source, 3, 'superseded', vector_json)
    );
    perform public.refresh_knowledge_chunks('dole_ble_lmi', array[source], inputs, '[]', run_log);
    perform public.refresh_knowledge_chunks('dole_ble_lmi', array[unrelated],
        jsonb_build_array(pg_temp.sw09_chunk(unrelated, 0, 'unrelated valid data', vector_json)), '[]', run_log);
    update public.knowledge_chunks set ingestion_timestamp = '2026-01-01T00:00:00Z'
        where source_url = source and chunk_index = 0;
    select ingestion_timestamp into old_timestamp from public.knowledge_chunks
        where source_url = source and chunk_index = 0;
    inputs := jsonb_build_array(
        pg_temp.sw09_chunk(source, 0, 'unchanged', null),
        pg_temp.sw09_chunk(source, 1, 'changed', vector_json),
        pg_temp.sw09_chunk(source, 2, 'new', vector_json)
    );
    changed := public.refresh_knowledge_chunks('dole_ble_lmi', array[source], inputs,
        pg_temp.sw09_snapshot(source), run_log);
    if changed <> 3 or (select count(*) from public.knowledge_chunks where source_url = source) <> 3
       or exists (select 1 from public.knowledge_chunks where source_url = source and chunk_index = 3)
       or not exists (select 1 from public.knowledge_chunks where source_url = unrelated)
    then raise exception 'I13 replacement/deletion/isolation contract failed'; end if;
    if (select ingestion_timestamp from public.knowledge_chunks where source_url = source and chunk_index = 0)
        is distinct from old_timestamp then raise exception 'I13 unchanged timestamp changed'; end if;
    if exists (select 1 from public.knowledge_chunks where source_url = source and publication_date is not null)
    then raise exception 'I08 unknown date fabricated'; end if;

    select to_jsonb(m) into previous_metadata from public.ingestion_metadata m where source_type = 'dole_ble_lmi';
    inputs := jsonb_build_array(
        pg_temp.sw09_chunk(source, 0, 'unchanged', null),
        pg_temp.sw09_chunk(source, 1, 'changed', null),
        pg_temp.sw09_chunk(source, 2, 'new', null)
    );
    changed := public.refresh_knowledge_chunks('dole_ble_lmi', array[source], inputs,
        pg_temp.sw09_snapshot(source), run_log);
    if changed <> 0 or (select to_jsonb(m) from public.ingestion_metadata m where source_type = 'dole_ble_lmi')
        is distinct from previous_metadata then raise exception 'I08 no-op advanced freshness'; end if;

    select jsonb_agg(to_jsonb(k) order by k.chunk_index) into previous from public.knowledge_chunks k where source_url = source;
    select count(*) into previous_logs from public.ingestion_logs;
    -- This fails AFTER the chunk upsert and deletion: the whole RPC must roll back.
    failed := false;
    begin
        perform public.refresh_knowledge_chunks('dole_ble_lmi', array[source],
            jsonb_build_array(pg_temp.sw09_chunk(source, 0, 'failed replacement', vector_json)),
            pg_temp.sw09_snapshot(source), '{}'::jsonb);
    exception when not_null_violation then failed := true;
    end;
    if not failed or (select jsonb_agg(to_jsonb(k) order by k.chunk_index) from public.knowledge_chunks k where source_url = source)
        is distinct from previous or (select count(*) from public.ingestion_logs) <> previous_logs
        or (select to_jsonb(m) from public.ingestion_metadata m where source_type = 'dole_ble_lmi')
           is distinct from previous_metadata
    then raise exception 'I09 failed write did not preserve last valid data and markers'; end if;

    failed := false;
    begin
        perform public.refresh_knowledge_chunks('dole_ble_lmi', array[source], inputs, '[]', run_log);
    exception when raise_exception then failed := true;
    end;
    if not failed then raise exception 'I13 stale snapshot accepted'; end if;

    if not exists (
        select 1 from public.match_knowledge_chunks(vector_json::text::vector, 'live_labor_demand') r
        where r.source_url = source and r.official_source_url = source and r.publication_date is null
    ) then raise exception 'I14 valid retrieval or provenance contract failed'; end if;
    if exists (select 1 from public.match_knowledge_chunks(vector_json::text::vector, 'path_feasibility'))
    then raise exception 'I14 cross-silo retrieval'; end if;
    failed := false;
    begin
        perform public.match_knowledge_chunks('[1,2,3]'::vector, 'live_labor_demand');
    exception when raise_exception then failed := true;
    end;
    if not failed then raise exception 'I14 incompatible dimensions accepted'; end if;
    failed := false;
    begin
        perform public.match_knowledge_chunks(vector_json::text::vector, 'live_labor_demand', 5, 0.3,
            'text-embedding-004', 768);
    exception when raise_exception then failed := true;
    end;
    if not failed then raise exception 'I14 incompatible model accepted'; end if;
    update public.knowledge_chunks set embedding_model = null, embedding_dimensions = null
        where source_url = source;
    failed := false;
    begin
        perform public.match_knowledge_chunks(vector_json::text::vector, 'live_labor_demand');
    exception when raise_exception then failed := true;
    end;
    if not failed then raise exception 'I14 unverified legacy vectors accepted'; end if;
end;
$$;
rollback;

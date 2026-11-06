-- Disposable pgvector database, after sw09_bootstrap.sql. All fixtures roll back.
begin;
-- Isolate sentinel counts from any pre-existing public evidence in the test database.
truncate public.knowledge_chunks;
insert into public.knowledge_chunks (
    silo_id, source_type, source_url, chunk_index, content, content_hash, embedding,
    acquisition_method, source_metadata, embedding_model, embedding_dimensions,
    official_source_url, publication_date
)
select silo, source, 'https://example.gov.ph/sw14/' || source, 0,
    'SENTINEL_' || source, 'synthetic-test-only', array_fill(0.25::real, array[768])::vector,
    method, '{"title":"Synthetic I05 sentinel"}'::jsonb, 'gemini-embedding-001', 768,
    'https://example.gov.ph/sw14/' || source, null
from (values
    ('market_analytics', 'psa_openstat_lfs', 'operator_curated_csv'),
    ('live_labor_demand', 'dole_ble_lmi', 'operator_curated_pdf'),
    ('path_feasibility', 'ched_cmo', 'automated_pdf'),
    ('path_feasibility', 'tesda_manual', 'manual_curation')
) fixtures(silo, source, method);

set local role service_role;
do $$
declare
    agent text;
    silo text;
    target text;
    expected_sources text[];
    source text;
    result record;
    retrieved integer := 0;
    expected_count integer;
    rejected boolean;
    query_vector vector := array_fill(0.25::real, array[768])::vector;
    previous jsonb;
begin
    if to_regprocedure('public.match_knowledge_chunks(vector,text,integer,double precision,text,integer)') is not null
    then raise exception 'Unbound retrieval overload still exists'; end if;
    if has_function_privilege('anon',
       'public.match_knowledge_chunks(vector,text,integer,double precision,text,integer,text)', 'execute')
       or has_function_privilege('authenticated',
       'public.match_knowledge_chunks(vector,text,integer,double precision,text,integer,text)', 'execute')
    then raise exception 'Specialist RPC exposed to public/counselor role'; end if;
    select jsonb_agg(to_jsonb(k) order by k.source_url) into previous from public.knowledge_chunks k;

    for agent, silo, expected_sources in select * from (values
        ('AcademicAuditor', 'market_analytics', array['psa_openstat_lfs']),
        ('IndustryAnalyst', 'live_labor_demand', array['dole_ble_lmi']),
        ('FeasibilityStrategist', 'path_feasibility', array['ched_cmo', 'tesda_manual'])
    ) routing(agent, silo, sources) loop
        expected_count := 0;
        -- Identical embeddings in every silo: similarity cannot accidentally isolate these.
        for result in select * from public.match_knowledge_chunks(
            query_vector, silo, match_threshold => -1, request_agent => agent
        ) loop
            retrieved := retrieved + 1;
            expected_count := expected_count + 1;
            if result.silo_id <> silo or not (result.source_type = any(expected_sources))
               or result.content <> 'SENTINEL_' || result.source_type
               or result.source_url <> 'https://example.gov.ph/sw14/' || result.source_type
               or result.chunk_index <> 0 or result.publication_date is not null
               or result.official_source_url <> result.source_url
               or result.ingestion_timestamp is null
            then raise exception 'I05 cross-silo bleed or provenance loss for %', agent; end if;
        end loop;
        if expected_count <> cardinality(expected_sources)
        then raise exception 'I05 positive sentinel missing for %', agent; end if;
        foreach target in array array['market_analytics', 'live_labor_demand', 'path_feasibility', '*', '', null] loop
            if target is not distinct from silo then continue; end if;
            rejected := false;
            begin
                perform public.match_knowledge_chunks(query_vector, target, request_agent => agent);
            exception when raise_exception then rejected := sqlerrm = 'Unauthorized specialist silo request'; end;
            if not rejected then raise exception 'I05 broadened silo accepted: % -> %', agent, target; end if;
        end loop;
        -- Wrongly source-tagged records in a valid silo also fail closed.
        select k.source_type into source from public.knowledge_chunks k where k.silo_id = silo limit 1;
        update public.knowledge_chunks k set source_type = 'session_notes' where k.silo_id = silo and k.source_type = source;
        rejected := false;
        begin
            perform public.match_knowledge_chunks(query_vector, silo, request_agent => agent);
        exception when raise_exception then rejected := sqlerrm = 'Unauthorized public source in specialist silo'; end;
        if not rejected then raise exception 'I05 private/nonassigned source tag accepted'; end if;
        update public.knowledge_chunks k set source_type = source where k.silo_id = silo and k.source_type = 'session_notes';
    end loop;
    if retrieved <> 4 then raise exception 'I05 nonzero denominator failed: %', retrieved; end if;
    foreach agent in array array[null, '', 'Other', 'toString'] loop
        rejected := false;
        begin
            perform public.match_knowledge_chunks(query_vector, 'market_analytics', request_agent => agent);
        exception when raise_exception then rejected := sqlerrm = 'Unauthorized specialist silo request'; end;
        if not rejected then raise exception 'I05 invalid specialist accepted'; end if;
    end loop;
    -- Old callers that omit specialist identity must fail, rather than regain generic access.
    rejected := false;
    begin
        perform public.match_knowledge_chunks(query_vector, 'market_analytics');
    exception when raise_exception then rejected := sqlerrm = 'Unauthorized specialist silo request'; end;
    if not rejected then raise exception 'I05 missing specialist accepted'; end if;
    rejected := false;
    begin
        perform public.match_knowledge_chunks(query_vector, 'market_analytics', match_count => null, request_agent => 'AcademicAuditor');
    exception when raise_exception then rejected := sqlerrm = 'Invalid vector search limits'; end;
    if not rejected then raise exception 'Unbounded count accepted'; end if;
    rejected := false;
    begin
        perform public.match_knowledge_chunks(query_vector, 'market_analytics', match_threshold => 'NaN', request_agent => 'AcademicAuditor');
    exception when raise_exception then rejected := sqlerrm = 'Invalid vector search limits'; end;
    if not rejected then raise exception 'Nonfinite threshold accepted'; end if;
    if (select jsonb_agg(to_jsonb(k) order by k.source_url) from public.knowledge_chunks k) is distinct from previous
    then raise exception 'I05 retrieval mutated public knowledge'; end if;
    delete from public.knowledge_chunks k where k.silo_id = 'path_feasibility';
    if exists(select 1 from public.match_knowledge_chunks(query_vector, 'path_feasibility', request_agent => 'FeasibilityStrategist'))
    then raise exception 'Empty silo fell back to foreign evidence'; end if;
    raise notice 'I05 PASS: 4/4 sentinel records; cross-silo bleed 0/4; unauthorized requests rejected';
end;
$$;
rollback;

-- SW-14: bind the existing service-only retrieval RPC to a specialist contract.
-- Missing agent identity fails closed; the old unbound overload is removed.
-- Replace the old RPC rather than leaving an unguarded overload available.
drop function public.match_knowledge_chunks(vector, text, integer, double precision, text, integer);
create function public.match_knowledge_chunks(
    query_embedding vector(768), target_silo_id text,
    match_count integer default 5, match_threshold double precision default 0.7,
    query_model text default 'gemini-embedding-001', query_dimensions integer default 768,
    request_agent text default null
) returns table (
    silo_id text, source_url text, chunk_index integer, content text,
    acquisition_method text, source_metadata jsonb, ingestion_timestamp timestamptz,
    similarity double precision, source_type text, official_source_url text,
    publication_date date, embedding_model text, embedding_dimensions integer
)
language plpgsql stable security invoker set search_path = public, extensions, pg_temp
as $$
declare
    assigned_silo text;
    assigned_sources text[];
begin
    select silo, sources into assigned_silo, assigned_sources from (values
        ('AcademicAuditor', 'market_analytics', array['psa_openstat_lfs']),
        ('IndustryAnalyst', 'live_labor_demand', array['dole_ble_lmi']),
        ('FeasibilityStrategist', 'path_feasibility', array['ched_cmo', 'tesda_manual'])
    ) routing(agent, silo, sources) where routing.agent = request_agent;
    if assigned_silo is null or target_silo_id is distinct from assigned_silo then
        raise exception 'Unauthorized specialist silo request';
    end if;
    if match_count is null or match_count < 1 or match_threshold is null
       or match_threshold not between -1 and 1 then
        raise exception 'Invalid vector search limits';
    end if;
    if exists (select 1 from public.knowledge_chunks k where k.silo_id = assigned_silo
        and (k.source_type is null or not (k.source_type = any(assigned_sources)))) then
        raise exception 'Unauthorized public source in specialist silo';
    end if;
    if query_model is distinct from 'gemini-embedding-001' or query_dimensions is distinct from 768
       or query_embedding is null or vector_dims(query_embedding) <> 768 then
        raise exception 'Incompatible query embedding: require gemini-embedding-001 / 768';
    end if;
    if exists (select 1 from public.knowledge_chunks k where k.silo_id = assigned_silo and (
        k.embedding_model is distinct from query_model or k.embedding_dimensions is distinct from query_dimensions
    )) then
        raise exception 'Unverified or incompatible stored embeddings; refresh this silo before retrieval';
    end if;
    return query select k.silo_id, k.source_url, k.chunk_index, k.content,
        k.acquisition_method, k.source_metadata, k.ingestion_timestamp,
        1 - (k.embedding <=> query_embedding), k.source_type, k.official_source_url,
        k.publication_date, k.embedding_model, k.embedding_dimensions
    from public.knowledge_chunks k where k.silo_id = assigned_silo
        and k.source_type = any(assigned_sources)
        and 1 - (k.embedding <=> query_embedding) > match_threshold
    order by k.embedding <=> query_embedding limit match_count;
end;
$$;
revoke all on function public.match_knowledge_chunks(vector, text, integer, double precision, text, integer, text)
    from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(vector, text, integer, double precision, text, integer, text)
    to service_role;

\set ON_ERROR_STOP on
\ir sw09_bootstrap.sql
create role authenticator;
create table public.sessions(id uuid);
create schema storage;
create table storage.objects(name text);
\ir ../migrations/20261107102120_sw27_safe_operations.sql
begin;
set local role ingestion_worker;
do $$
declare source text := 'https://ble.dole.gov.ph/sw27-public-fixture.pdf';
  body text := 'Public fixture';
  input jsonb;
  log jsonb := jsonb_build_object('workflow_name','dole_ble_lmi_pdf','started_at',now(),
    'error_message','PRIVATE','run_metadata','{"secret":"PRIVATE","total_records":1}'::jsonb);
begin
  input := jsonb_build_array(jsonb_build_object(
    'silo_id','live_labor_demand','source_type','dole_ble_lmi','source_url',source,
    'chunk_index',0,'content',body,'content_hash',encode(sha256(convert_to(body,'UTF8')),'hex'),
    'embedding',to_jsonb(array_fill(0.25::real,array[768])),
    'embedding_model','gemini-embedding-001','embedding_dimensions',768,
    'acquisition_method','operator_curated_pdf','official_source_url',source,'source_metadata','{}'::jsonb));
  perform public.refresh_knowledge_chunks('dole_ble_lmi',array[source],input,'[]',log);
  if (select count(*) from public.knowledge_chunks where source_url=source) <> 1
  then raise exception 'Scoped ingestion failed'; end if;
  if has_table_privilege(current_user,'public.sessions','select')
    or has_table_privilege(current_user,'public.ingestion_logs','delete')
    or has_function_privilege(current_user,'public.prune_ingestion_logs()','execute')
  then raise exception 'Worker has administrative/student privileges'; end if;
  begin
    perform name from storage.objects;
    raise exception 'Worker can read private storage';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.ingestion_logs where error_message like '%PRIVATE%' or run_metadata::text like '%PRIVATE%')
  then raise exception 'Raw diagnostics persisted'; end if;
end $$;
rollback;

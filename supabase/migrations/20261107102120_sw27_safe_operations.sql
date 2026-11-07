-- Operational logs are measurements, never source content. Existing log history is sanitized too.
alter table public.ingestion_metadata drop constraint ingestion_metadata_last_success_log_id_fkey;
alter table public.ingestion_metadata add constraint ingestion_metadata_last_success_log_id_fkey
  foreign key (last_success_log_id) references public.ingestion_logs(log_id) on delete set null;
alter table public.publication_index_cache drop constraint publication_index_cache_ingestion_log_id_fkey;
alter table public.publication_index_cache add constraint publication_index_cache_ingestion_log_id_fkey
  foreign key (ingestion_log_id) references public.ingestion_logs(log_id) on delete set null;

create function public.sanitize_ingestion_log() returns trigger
language plpgsql set search_path = '' as $$
declare safe_metadata jsonb;
begin
  select coalesce(jsonb_object_agg(key,value), '{}'::jsonb) into safe_metadata
  from jsonb_each(case when jsonb_typeof(new.run_metadata) = 'object' then new.run_metadata else '{}'::jsonb end)
  where (key in ('target_year','index_size','already_ingested','publications_processed',
    'publications_failed','total_records','files_processed','files_failed','duration_ms','inserted','updated','skipped_unchanged','removed')
    and jsonb_typeof(value) = 'number' and value::text ~ '^[0-9]{1,10}$')
    or (key = 'run_id' and value #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  new.run_metadata := safe_metadata;
  new.error_message := case when new.run_status = 'failure' or new.error_message is not null then 'ingestion_failed' else null end;
  if new.workflow_name not in ('psa_openstat_lfs','ched_cmo_pdf','dole_ble_lmi_pdf','tesda_manual_curation') then
    new.workflow_name := 'unknown';
  end if;
  if tg_op = 'INSERT' then new.created_at := clock_timestamp(); end if;
  return new;
end $$;
revoke all on function public.sanitize_ingestion_log() from public, anon, authenticated;
create trigger sanitize_ingestion_log before insert or update on public.ingestion_logs
  for each row execute function public.sanitize_ingestion_log();
update public.ingestion_logs set run_metadata = run_metadata;
create index ingestion_logs_expiry_idx on public.ingestion_logs(created_at);

-- The job login receives only this role, not service_role or access to student tables/storage.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ingestion_log_maintenance') then
    create role ingestion_log_maintenance nologin noinherit;
  end if;
end $$;
create function public.prune_ingestion_logs() returns bigint
language plpgsql security definer set search_path = '' as $$
declare removed bigint;
begin
  delete from public.ingestion_logs where created_at <= clock_timestamp() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke all on function public.prune_ingestion_logs() from public, anon, authenticated;
grant usage on schema public to ingestion_log_maintenance;
grant execute on function public.prune_ingestion_logs() to ingestion_log_maintenance;
alter table public.ingestion_logs enable row level security;
alter table public.ingestion_metadata enable row level security;
alter table public.publication_index_cache enable row level security;
revoke all on public.ingestion_logs, public.ingestion_metadata, public.publication_index_cache from anon, authenticated;
select public.prune_ingestion_logs();

-- Ingestion may read/write public knowledge only, and cannot access student tables or objects.
create role ingestion_worker nologin noinherit;
grant ingestion_worker to authenticator;
grant usage on schema public to ingestion_worker;
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    grant usage on schema extensions to ingestion_worker;
  end if;
end $$;
grant select on public.silos, public.knowledge_chunks, public.publication_index_cache to ingestion_worker;
grant insert, update, delete on public.knowledge_chunks to ingestion_worker;
grant select(log_id), insert on public.ingestion_logs to ingestion_worker;
grant select, insert, update on public.ingestion_metadata, public.publication_index_cache to ingestion_worker;
grant execute on function public.refresh_knowledge_chunks(text,text[],jsonb,jsonb,jsonb) to ingestion_worker;
create policy ingestion_public_knowledge on public.knowledge_chunks for all to ingestion_worker
  using (true) with check (true);
create policy ingestion_operational_id on public.ingestion_logs for select to ingestion_worker using (true);
create policy ingestion_operational_insert on public.ingestion_logs for insert to ingestion_worker with check (true);
create policy ingestion_freshness on public.ingestion_metadata for all to ingestion_worker using (true) with check (true);
create policy ingestion_public_cache on public.publication_index_cache for all to ingestion_worker using (true) with check (true);

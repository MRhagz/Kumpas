-- CLI migration creation was unavailable: its ~/.supabase state is read-only.
-- Independent clocks; durable references are committed before metadata disappears.
alter table public.sessions add column draft_purged_at timestamptz;
create table public.retention_tombstones (
  session_id uuid primary key,
  deleted_at timestamptz not null default clock_timestamp()
);
create table public.report_artifact_cleanup (
  object_key text primary key,
  requested_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text check (last_error in ('storage_delete_failed'))
);
create index report_cleanup_due on public.report_artifact_cleanup(next_attempt_at);
alter table public.retention_tombstones enable row level security;
alter table public.report_artifact_cleanup enable row level security;
revoke all on public.retention_tombstones, public.report_artifact_cleanup from public, anon, authenticated;
grant select, insert on public.retention_tombstones to service_role;
grant select, insert, update, delete on public.report_artifact_cleanup to service_role;

create function public.record_session_deletion() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into public.retention_tombstones(session_id) values(old.id) on conflict do nothing;
    return old;
  end if;
  if new.status = 'cancelled' then
    insert into public.retention_tombstones(session_id) values(new.id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger session_deletion_tombstone after insert or update of status on public.sessions
  for each row execute function public.record_session_deletion();
create trigger session_removed_tombstone before delete on public.sessions
  for each row execute function public.record_session_deletion();
insert into public.retention_tombstones(session_id)
  select id from public.sessions where status = 'cancelled' on conflict do nothing;

create function public.queue_report_deletion() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.report_artifact_cleanup(object_key) values(old.object_key) on conflict do nothing;
  return old;
end $$;
create trigger report_deletion_queue before delete on public.report_versions
  for each row execute function public.queue_report_deletion();

-- One transaction per session. On failure the revoked/expired parent remains for
-- the next sweep. No academic correction rows are touched.
create function public.purge_session_content(p_session_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null then return; end if;
  if s.status <> 'cancelled' and s.expires_at > clock_timestamp()
    and not exists(select 1 from public.retention_tombstones where session_id = s.id) then
    raise exception 'Session has not expired or been terminated';
  end if;
  if exists(select 1 from public.retention_tombstones where session_id = s.id) then
    update public.sessions set status = 'cancelled' where id = s.id;
    delete from public.report_versions where session_id = s.id;
  else
    update public.sessions set status = 'expired' where id = s.id;
    delete from public.report_versions where session_id = s.id and expires_at <= clock_timestamp();
  end if;
  delete from public.profile_versions where session_id = s.id;
  delete from public.ranked_recommendations where session_id = s.id;
  delete from public.extraction_results where session_id = s.id;
  delete from public.session_notes where session_id = s.id;
  -- Only exact-version PDF authorization pointers survive draft expiry.
  update public.sessions set approved_profile = null, module_status = '{}',
    report_status = 'not_started', completed_at = null, draft_purged_at = clock_timestamp() where id = s.id;
  if not exists(select 1 from public.report_versions where session_id = s.id) then
    delete from public.sessions where id = s.id;
  end if;
end $$;

create function public.prepare_report_retention() returns bigint
language plpgsql security invoker set search_path = '' as $$
declare removed bigint;
begin
  delete from public.report_versions r where r.expires_at <= clock_timestamp()
    or exists(select 1 from public.retention_tombstones t where t.session_id = r.session_id);
  get diagnostics removed = row_count;
  delete from public.sessions s where draft_purged_at is not null
    and not exists(select 1 from public.report_versions r where r.session_id = s.id);
  return removed;
end $$;

create function public.claim_report_cleanup(p_limit integer default 50)
returns setof public.report_artifact_cleanup
language sql security invoker set search_path = '' as $$
  with due as (
    select object_key from public.report_artifact_cleanup
    where next_attempt_at <= clock_timestamp() and (lease_until is null or lease_until <= clock_timestamp())
    order by next_attempt_at limit greatest(1, least(p_limit, 100)) for update skip locked
  )
  update public.report_artifact_cleanup q set lease_token = gen_random_uuid(),
    lease_until = clock_timestamp() + interval '5 minutes', attempts = attempts + 1
  from due where q.object_key = due.object_key returning q.*;
$$;

create function public.report_cleanup_pending() returns boolean
language sql security invoker set search_path = '' as $$
  select exists(select 1 from public.report_artifact_cleanup);
$$;

-- SW-06 no longer persists upload bytes. Every remaining document object is
-- legacy/transient, including objects whose extraction row was already lost.
create function public.queue_legacy_document_cleanup() returns void
language sql security invoker set search_path = '' as $$
  insert into public.extraction_artifact_cleanup(session_id, object_path)
    select case when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(name, '/', 1)::uuid else '00000000-0000-0000-0000-000000000000'::uuid end, name
    from storage.objects where bucket_id = 'kumpas-documents'
    on conflict (object_path) do nothing;
$$;

create function public.extraction_cleanup_pending(p_session_id uuid default null) returns boolean
language sql security invoker set search_path = '' as $$
  select exists(select 1 from public.extraction_artifact_cleanup where p_session_id is null or session_id = p_session_id);
$$;

-- Restore target stays isolated until this runs with the CURRENT independent
-- deletion ledger, never just the tombstones contained in the old backup.
create function public.reapply_retention_tombstones(p_tombstones jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_tombstones) is distinct from 'array' then raise exception 'Deletion ledger required'; end if;
  insert into public.retention_tombstones(session_id, deleted_at)
    select session_id, deleted_at from jsonb_to_recordset(p_tombstones) as t(session_id uuid, deleted_at timestamptz)
    on conflict do nothing;
  update public.sessions s set status = 'cancelled'
    where exists(select 1 from public.retention_tombstones t where t.session_id = s.id);
  -- Recheck restored payloads even if a snapshot carries an old cleanup marker.
  update public.sessions set draft_purged_at = null
    where expires_at <= clock_timestamp() or status = 'cancelled';
  perform public.prepare_report_retention();
end $$;

revoke all on function public.record_session_deletion(), public.queue_report_deletion(),
  public.purge_session_content(uuid), public.prepare_report_retention(),
  public.claim_report_cleanup(integer), public.report_cleanup_pending(), public.queue_legacy_document_cleanup(),
  public.extraction_cleanup_pending(uuid), public.reapply_retention_tombstones(jsonb) from public, anon, authenticated;
grant execute on function public.record_session_deletion(), public.queue_report_deletion(),
  public.purge_session_content(uuid), public.prepare_report_retention(),
  public.claim_report_cleanup(integer), public.report_cleanup_pending(), public.queue_legacy_document_cleanup(),
  public.extraction_cleanup_pending(uuid), public.reapply_retention_tombstones(jsonb) to service_role;

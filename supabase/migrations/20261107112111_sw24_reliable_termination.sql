-- CLI migration creation failed because its telemetry directory is read-only.
-- No payload or FK: these owner-bound retry references survive content deletion.
create table public.session_termination_requests (
  session_id uuid primary key,
  counselor_id uuid not null,
  inventory_completed boolean not null default false,
  last_attempt_at timestamptz,
  completed_at timestamptz
);
create index session_termination_pending on public.session_termination_requests(last_attempt_at)
  where completed_at is null;
alter table public.session_termination_requests enable row level security;
revoke all on public.session_termination_requests from public, anon, authenticated;
grant select, insert, update on public.session_termination_requests to service_role;

create function public.queue_session_termination() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'cancelled' then
    insert into public.session_termination_requests(session_id, counselor_id)
      values(new.id, new.counselor_id) on conflict (session_id) do update set completed_at = null;
  end if;
  return new;
end $$;
create trigger session_termination_retry after insert or update of status on public.sessions
  for each row execute function public.queue_session_termination();
insert into public.session_termination_requests(session_id, counselor_id)
  select id, counselor_id from public.sessions where status = 'cancelled' on conflict do nothing;

-- Same parent lock as approval, analysis publication, review and PDF delivery.
-- Commit revocation before any Storage I/O; a missing session can only be retried
-- through its original owner's durable termination reference.
create function public.begin_session_termination(p_session_id uuid, p_counselor_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare s public.sessions;
begin
  if p_counselor_id is null then return false; end if;
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null then
    return exists(select 1 from public.session_termination_requests
      where session_id = p_session_id and counselor_id = p_counselor_id);
  end if;
  if s.counselor_id is distinct from p_counselor_id then return false; end if;
  update public.sessions set status = 'cancelled', approved_profile = null,
    module_status = '{}', report_status = 'not_started' where id = s.id;
  return true;
end $$;

create function public.session_termination_state(p_session_id uuid, p_inventory_completed boolean default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare report_pending boolean; content_pending boolean; pending boolean;
begin
  -- Retain the inventory job even when purge has removed its parent.
  perform 1 from public.session_termination_requests where session_id = p_session_id for update;
  if not found then raise exception 'Termination reference unavailable'; end if;
  if p_inventory_completed is not null then
    update public.session_termination_requests set inventory_completed = p_inventory_completed where session_id = p_session_id;
  end if;
  select not inventory_completed into report_pending from public.session_termination_requests where session_id = p_session_id;
  report_pending := report_pending or exists(select 1 from public.report_artifact_cleanup
    where starts_with(object_key, p_session_id::text || '/'))
    or exists(select 1 from public.report_versions where session_id = p_session_id);
  content_pending := exists(select 1 from public.sessions where id = p_session_id);
  pending := report_pending or content_pending or exists(select 1 from public.extraction_artifact_cleanup where session_id = p_session_id);
  update public.session_termination_requests set completed_at = case when pending then null
    else coalesce(completed_at, clock_timestamp()) end where session_id = p_session_id;
  return jsonb_build_object('cleanupPending', pending, 'reportPdfPurged', not report_pending and not content_pending);
end $$;

create function public.pending_session_terminations(p_limit integer default 50)
returns table(id uuid) language sql security invoker set search_path = '' as $$
  with due as (
    select session_id from public.session_termination_requests where completed_at is null
      order by last_attempt_at nulls first, session_id
      limit greatest(1, least(p_limit, 100)) for update skip locked
  )
  update public.session_termination_requests q set last_attempt_at = clock_timestamp()
    from due where q.session_id = due.session_id returning q.session_id;
$$;

revoke all on function public.queue_session_termination(), public.begin_session_termination(uuid, uuid),
  public.session_termination_state(uuid, boolean), public.pending_session_terminations(integer) from public, anon, authenticated;
grant execute on function public.queue_session_termination(), public.begin_session_termination(uuid, uuid),
  public.session_termination_state(uuid, boolean), public.pending_session_terminations(integer) to service_role;

-- Keep review history on the report, independently of its release eligibility.
alter table public.report_versions
  add column review_decision text check (review_decision in ('approved', 'rejected')),
  add column reviewed_by uuid,
  add column reviewed_at timestamptz,
  add column downloaded_at timestamptz,
  add constraint report_review_record check (
    (review_decision is null and reviewed_by is null and reviewed_at is null) or
    (review_decision is not null and reviewed_by is not null and reviewed_at is not null
      and reviewed_by = counselor_id)
  );
grant update(review_decision, reviewed_by, reviewed_at, downloaded_at) on public.report_versions to service_role;

create function public.record_report_review() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.review_decision is not null and
    (new.review_decision, new.reviewed_by, new.reviewed_at) is distinct from
    (old.review_decision, old.reviewed_by, old.reviewed_at) then
    raise exception 'Review history is immutable';
  end if;
  if old.status = 'draft' and new.status in ('approved', 'rejected') then
    new.review_decision := new.status;
    new.reviewed_by := new.counselor_id;
    new.reviewed_at := clock_timestamp();
  elsif (new.review_decision, new.reviewed_by, new.reviewed_at) is distinct from
    (old.review_decision, old.reviewed_by, old.reviewed_at) then
    raise exception 'Review requires a draft decision';
  end if;
  if old.downloaded_at is not null and new.downloaded_at is distinct from old.downloaded_at then
    raise exception 'First delivery time is immutable';
  end if;
  return new;
end $$;
create trigger report_review_record before update on public.report_versions
  for each row execute function public.record_report_review();

-- Retain the existing review RPC; this entry point also compares the browser run.
create function public.decide_report_version(
  p_session_id uuid, p_counselor_id uuid, p_expected_version integer,
  p_report_version integer, p_run_id uuid, p_decision text
) returns public.report_versions
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null or s.counselor_id is distinct from p_counselor_id or p_counselor_id is null
    then raise exception 'Session unavailable'; end if;
  if p_run_id is null or s.current_run_id is distinct from p_run_id
    then raise exception 'Stale report run'; end if;
  return public.review_report_version(s.id, p_counselor_id, p_expected_version, p_report_version, p_decision);
end $$;

-- Opening correction is explicit and token-bound, including after final delivery.
-- Actual saved edits still use SW-07 to invalidate the approved snapshot.
create function public.prepare_report_correction(
  p_session_id uuid, p_counselor_id uuid, p_expected_version integer,
  p_report_version integer, p_run_id uuid
) returns public.sessions
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null or s.counselor_id is distinct from p_counselor_id or p_counselor_id is null
    or s.status not in ('active', 'completed') or s.expires_at <= clock_timestamp()
    then raise exception 'Session unavailable'; end if;
  if p_run_id is null or s.current_run_id is distinct from p_run_id
    or s.current_profile_version is distinct from p_expected_version
    or s.current_report_version is distinct from p_report_version
    then raise exception 'Stale report or profile version'; end if;
  update public.sessions set status = 'active', completed_at = null,
    report_status = case when report_status = 'downloaded' then 'ready' else report_status end
    where id = s.id returning * into s;
  return s;
end $$;

create function public.regenerate_report_version(
  p_session_id uuid, p_counselor_id uuid, p_expected_version integer,
  p_report_version integer, p_run_id uuid
) returns public.analysis_runs
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions; r public.analysis_runs;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null or s.counselor_id is distinct from p_counselor_id or p_counselor_id is null
    or s.status not in ('active', 'completed') or s.expires_at <= clock_timestamp()
    then raise exception 'Session unavailable'; end if;
  if p_run_id is null or s.current_run_id is distinct from p_run_id
    or s.current_profile_version is distinct from p_expected_version
    or s.current_report_version is distinct from p_report_version
    then raise exception 'Stale report or profile version'; end if;
  if not exists(select 1 from public.report_versions where session_id = s.id
    and report_version = p_report_version and run_id = p_run_id
    and approved_profile_version = p_expected_version and counselor_id = p_counselor_id
    and status in ('draft', 'approved', 'rejected') and expires_at > clock_timestamp())
    then raise exception 'Report unavailable'; end if;
  -- Explicit regeneration can reopen a completed, still-live draft, never extend it.
  update public.sessions set status = 'active', completed_at = null where id = s.id;
  r := public.start_analysis_run(s.id, p_counselor_id, p_expected_version, p_run_id);
  update public.sessions set report_status = 'not_started',
    module_status = jsonb_set(jsonb_set(module_status, '{analysis}', '"not_started"'), '{report}', '"not_started"')
    where id = s.id;
  return r;
end $$;

-- Called only after Storage returned the PDF; recheck under the same parent lock
-- used by review, regeneration, corrections and termination. No external I/O here.
create function public.complete_report_delivery(
  p_session_id uuid, p_counselor_id uuid, p_expected_version integer,
  p_report_version integer, p_run_id uuid
) returns public.report_versions
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions; v public.report_versions; t timestamptz;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null or s.counselor_id is distinct from p_counselor_id or p_counselor_id is null
    or s.status not in ('active', 'completed', 'expired')
    then raise exception 'Session unavailable'; end if;
  if p_run_id is null or s.current_run_id is distinct from p_run_id
    or s.current_profile_version is distinct from p_expected_version
    or s.current_report_version is distinct from p_report_version
    then raise exception 'Stale report or profile version'; end if;
  select * into v from public.report_versions where session_id = s.id
    and report_version = p_report_version for update;
  t := clock_timestamp();
  if v.session_id is null or v.counselor_id is distinct from p_counselor_id
    or v.run_id is distinct from p_run_id or v.approved_profile_version is distinct from p_expected_version
    or v.status <> 'approved' or v.approved_at is null or v.expires_at <= t
    or v.object_key is distinct from s.id::text || '/' || p_report_version::text || '.pdf'
    then raise exception 'Approved report unavailable'; end if;
  update public.report_versions set downloaded_at = coalesce(downloaded_at, t)
    where session_id = s.id and report_version = v.report_version returning * into v;
  -- A PDF may outlive its draft. Do not resurrect content or completed progress.
  if s.status in ('active', 'completed') and s.expires_at > t then
    update public.sessions set status = 'completed', report_status = 'downloaded',
      module_status = jsonb_set(module_status, '{report}', '"complete"'),
      completed_at = coalesce(completed_at, t) where id = s.id;
  end if;
  return v;
end $$;

revoke all on function public.record_report_review(),
  public.decide_report_version(uuid, uuid, integer, integer, uuid, text),
  public.prepare_report_correction(uuid, uuid, integer, integer, uuid),
  public.regenerate_report_version(uuid, uuid, integer, integer, uuid),
  public.complete_report_delivery(uuid, uuid, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.record_report_review(),
  public.decide_report_version(uuid, uuid, integer, integer, uuid, text),
  public.prepare_report_correction(uuid, uuid, integer, integer, uuid),
  public.regenerate_report_version(uuid, uuid, integer, integer, uuid),
  public.complete_report_delivery(uuid, uuid, integer, integer, uuid) to service_role;

-- SW-02: additive contracts. Legacy JSON/progress is retained, never promoted.
alter table public.sessions
  add column current_profile_version integer not null default 0 check (current_profile_version >= 0),
  add column current_run_id uuid,
  add column current_report_version integer not null default 0 check (current_report_version >= 0);

-- Repair sliding/incorrect legacy clocks from the authoritative creation time.
update public.sessions set expires_at = created_at + interval '24 hours';
create function public.session_fixed_clock() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and (new.created_at is distinct from old.created_at
    or new.counselor_id is distinct from old.counselor_id) then
    raise exception 'Session creation and owner are immutable';
  end if;
  new.expires_at := new.created_at + interval '24 hours';
  return new;
end $$;
create trigger session_fixed_clock before insert or update on public.sessions
for each row execute function public.session_fixed_clock();

create table public.profile_versions (
  session_id uuid not null references public.sessions(id) on delete cascade,
  profile_version integer not null check (profile_version > 0),
  counselor_id uuid not null,
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  created_at timestamptz not null,
  approved_at timestamptz,
  primary key (session_id, profile_version)
);
create table public.analysis_runs (
  run_id uuid primary key,
  session_id uuid not null,
  approved_profile_version integer not null,
  counselor_id uuid not null,
  analysis_started_at timestamptz not null,
  deadline_at timestamptz not null,
  status text not null default 'running' check (status in ('running', 'completed', 'superseded')),
  foreign key (session_id, approved_profile_version)
    references public.profile_versions(session_id, profile_version) on delete cascade,
  check (deadline_at = analysis_started_at + interval '300 seconds')
);
create index analysis_runs_session_idx on public.analysis_runs(session_id, approved_profile_version);

-- Deliberately no Session/Profile/Run FK: minimal authorization metadata survives
-- draft deletion until the independently fixed PDF expiry (SDD 2.4). No payload.
create table public.report_versions (
  session_id uuid not null,
  report_version integer not null check (report_version > 0),
  counselor_id uuid not null,
  approved_profile_version integer not null check (approved_profile_version > 0),
  run_id uuid not null,
  object_key text not null unique,
  generated_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected', 'out_of_date')),
  approved_at timestamptz,
  primary key (session_id, report_version),
  check (expires_at = generated_at + interval '24 hours'),
  check ((status = 'approved') = (approved_at is not null))
);
create index report_versions_expiry_idx on public.report_versions(expires_at);

-- No browser grants: authorized server routes call invoker RPCs using service_role.
-- RLS denies all direct browser access; no SECURITY DEFINER bypass is introduced.
alter table public.profile_versions enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.report_versions enable row level security;
revoke all on public.profile_versions, public.analysis_runs, public.report_versions from public, anon, authenticated;
grant select, insert, delete on public.profile_versions to service_role;
grant select, insert, delete on public.analysis_runs, public.report_versions to service_role;
grant update(status) on public.analysis_runs to service_role;
grant update(status, approved_at) on public.report_versions to service_role;

create function public.profile_version_immutable() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Profile versions are immutable; create a new version';
end $$;
create trigger profile_version_immutable before update on public.profile_versions
for each row execute function public.profile_version_immutable();

-- All transitions lock the same parent before comparing tokens. Clock checks use
-- wall time AFTER lock acquisition, not transaction-start now(). Exceptions roll
-- back the entire RPC. NULL tokens fail closed through IS DISTINCT FROM.
create function public.save_profile_version(
  p_session_id uuid, p_counselor_id uuid, p_expected_version integer,
  p_profile jsonb, p_approve boolean default false
) returns public.profile_versions
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions; v public.profile_versions; t timestamptz;
begin
  select * into s from public.sessions where id = p_session_id for update;
  t := clock_timestamp();
  if s.id is null or s.counselor_id is distinct from p_counselor_id or p_counselor_id is null
    or s.status <> 'active' or s.expires_at <= t then raise exception 'Session unavailable'; end if;
  if s.current_profile_version is distinct from p_expected_version then raise exception 'Stale profile version'; end if;
  insert into public.profile_versions values
    (s.id, s.current_profile_version + 1, s.counselor_id, p_profile, t, case when p_approve then t end)
    returning * into v;
  update public.analysis_runs set status = 'superseded' where session_id = s.id;
  update public.report_versions set status = 'out_of_date', approved_at = null where session_id = s.id;
  update public.sessions set current_profile_version = v.profile_version, current_run_id = null where id = s.id;
  return v;
end $$;

create function public.start_analysis_run(
  p_session_id uuid, p_counselor_id uuid, p_expected_version integer, p_expected_run_id uuid
) returns public.analysis_runs
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions; r public.analysis_runs; t timestamptz;
begin
  select * into s from public.sessions where id = p_session_id for update;
  t := clock_timestamp();
  if s.id is null or s.counselor_id is distinct from p_counselor_id or p_counselor_id is null
    or s.status <> 'active' or s.expires_at <= t then raise exception 'Session unavailable'; end if;
  if s.current_profile_version is distinct from p_expected_version or s.current_run_id is distinct from p_expected_run_id
    then raise exception 'Stale run or profile version'; end if;
  if not exists (select 1 from public.profile_versions where session_id = s.id
    and profile_version = p_expected_version and approved_at is not null) then raise exception 'Profile approval required'; end if;
  update public.analysis_runs set status = 'superseded' where session_id = s.id;
  update public.report_versions set status = 'out_of_date', approved_at = null where session_id = s.id;
  insert into public.analysis_runs values
    (gen_random_uuid(), s.id, p_expected_version, s.counselor_id, t, t + interval '300 seconds', 'running') returning * into r;
  update public.sessions set current_run_id = r.run_id where id = s.id;
  return r;
end $$;

create function public.publish_report_version(
  p_session_id uuid, p_counselor_id uuid, p_expected_version integer, p_run_id uuid,
  p_expected_report_version integer
) returns public.report_versions
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions; r public.analysis_runs; v public.report_versions; t timestamptz;
begin
  select * into s from public.sessions where id = p_session_id for update;
  t := clock_timestamp();
  if s.id is null or s.counselor_id is distinct from p_counselor_id or p_counselor_id is null
    or s.status <> 'active' or s.expires_at <= t then raise exception 'Session unavailable'; end if;
  if s.current_profile_version is distinct from p_expected_version or s.current_run_id is distinct from p_run_id
    or s.current_report_version is distinct from p_expected_report_version then raise exception 'Stale report or profile version'; end if;
  select * into r from public.analysis_runs where run_id = p_run_id and session_id = s.id;
  if r.run_id is null or r.status <> 'running' or r.approved_profile_version <> p_expected_version
    or r.deadline_at <= t then raise exception 'Run unavailable or deadline elapsed'; end if;
  update public.report_versions set status = 'out_of_date', approved_at = null where session_id = s.id;
  insert into public.report_versions values
    (s.id, s.current_report_version + 1, s.counselor_id, p_expected_version, r.run_id,
     s.id::text || '/' || (s.current_report_version + 1)::text || '.pdf', t, t + interval '24 hours', 'draft', null)
    returning * into v;
  update public.analysis_runs set status = 'completed' where run_id = r.run_id;
  update public.sessions set current_report_version = v.report_version where id = s.id;
  return v;
end $$;

create function public.review_report_version(
  p_session_id uuid, p_counselor_id uuid, p_expected_version integer,
  p_report_version integer, p_decision text
) returns public.report_versions
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions; v public.report_versions; t timestamptz;
begin
  select * into s from public.sessions where id = p_session_id for update;
  t := clock_timestamp();
  if s.id is null or s.counselor_id is distinct from p_counselor_id or p_counselor_id is null
    or s.status not in ('active', 'completed') or s.expires_at <= t then raise exception 'Session unavailable'; end if;
  if s.current_profile_version is distinct from p_expected_version or s.current_report_version is distinct from p_report_version
    then raise exception 'Stale report or profile version'; end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then raise exception 'Invalid decision'; end if;
  update public.report_versions set status = p_decision, approved_at = case when p_decision = 'approved' then t end
    where session_id = s.id and report_version = p_report_version and approved_profile_version = p_expected_version
      and run_id = s.current_run_id and counselor_id = p_counselor_id and status = 'draft' and expires_at > t
    returning * into v;
  if v.session_id is null then raise exception 'Report unavailable or already reviewed'; end if;
  return v;
end $$;

revoke all on function public.session_fixed_clock(), public.profile_version_immutable(),
  public.save_profile_version(uuid, uuid, integer, jsonb, boolean),
  public.start_analysis_run(uuid, uuid, integer, uuid),
  public.publish_report_version(uuid, uuid, integer, uuid, integer),
  public.review_report_version(uuid, uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.save_profile_version(uuid, uuid, integer, jsonb, boolean),
  public.start_analysis_run(uuid, uuid, integer, uuid),
  public.publish_report_version(uuid, uuid, integer, uuid, integer),
  public.review_report_version(uuid, uuid, integer, integer, text) to service_role;

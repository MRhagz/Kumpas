-- CLI migration generation was attempted locally and outside the sandbox; both
-- terminated with SIGKILL. Additive migration, following the SW-02 contracts.
alter table public.sessions add column report_generation_version integer not null default 0 check (report_generation_version >= 0);
update public.sessions set report_generation_version = current_report_version;
grant update(report_generation_version) on public.sessions to service_role;

alter table public.analysis_runs
  add column phase text not null default 'pending'
    check (phase in ('pending', 'analysis', 'report_pending', 'report', 'ready', 'failed')),
  add column failed_stage text,
  add column recommendations jsonb,
  add column candidate_report_version integer check (candidate_report_version > 0);
grant update(phase, failed_stage, recommendations, candidate_report_version) on public.analysis_runs to service_role;

-- Approval and start share a transaction: no approved-but-untimed run window.
create function public.approve_and_start_analysis(
  p_session_id uuid, p_counselor_id uuid, p_expected_version integer, p_profile jsonb
) returns public.analysis_runs
language plpgsql security invoker set search_path = '' as $$
declare v public.profile_versions; r public.analysis_runs;
begin
  v := public.save_profile_version(p_session_id, p_counselor_id, p_expected_version, p_profile, true);
  r := public.start_analysis_run(p_session_id, p_counselor_id, v.profile_version, null);
  update public.sessions set approved_profile = p_profile,
    module_status = '{"intake":"complete","profile":"complete","analysis":"not_started","report":"not_started"}',
    report_status = 'not_started' where id = p_session_id;
  return r;
end $$;

-- Serializes a stage claim/result against approval, retry, cancellation and expiry.
-- Provider calls and storage writes happen outside this short transaction.
create function public.transition_processing_run(
  p_session_id uuid, p_counselor_id uuid, p_run_id uuid, p_expected_version integer,
  p_action text, p_result jsonb default null, p_stage text default null
) returns public.analysis_runs
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions; r public.analysis_runs; t timestamptz;
begin
  select * into s from public.sessions where id = p_session_id for update;
  t := clock_timestamp();
  if s.id is null or s.counselor_id is distinct from p_counselor_id or p_counselor_id is null
    or s.status <> 'active' or s.expires_at <= t then raise exception 'Session unavailable'; end if;
  if s.current_run_id is distinct from p_run_id or s.current_profile_version is distinct from p_expected_version
    then raise exception 'Stale run or profile version'; end if;
  select * into r from public.analysis_runs where run_id = p_run_id and session_id = s.id;
  if r.run_id is null or r.status <> 'running' then raise exception 'Run unavailable'; end if;

  if p_action = 'fail' then
    if r.phase in ('ready', 'failed') then return r; end if;
    update public.analysis_runs set phase = 'failed', failed_stage = p_stage where run_id = r.run_id;
    update public.sessions set module_status = jsonb_set(module_status, '{analysis}', '"failed"'),
      report_status = 'failed' where id = s.id;
  elsif p_action = 'retry' then
    if r.phase <> 'failed' and r.deadline_at > t then raise exception 'Run still in progress'; end if;
    r := public.start_analysis_run(s.id, p_counselor_id, p_expected_version, p_run_id);
    update public.sessions set module_status = jsonb_set(jsonb_set(module_status, '{analysis}', '"not_started"'), '{report}', '"not_started"'),
      report_status = 'not_started' where id = s.id;
    return r;
  else
    if r.deadline_at <= t then raise exception 'Processing deadline elapsed'; end if;
    if p_action = 'claim_analysis' and r.phase = 'pending' then
      update public.analysis_runs set phase = 'analysis' where run_id = r.run_id;
      update public.sessions set module_status = jsonb_set(module_status, '{analysis}', '"in_progress"') where id = s.id;
    elsif p_action = 'analysis_ready' and r.phase = 'analysis' then
      if p_result is null or p_result->>'sessionId' is distinct from s.id::text
        or jsonb_typeof(p_result->'recommendations') is distinct from 'array'
        then raise exception 'Invalid recommendations'; end if;
      update public.analysis_runs set phase = 'report_pending', recommendations = p_result where run_id = r.run_id;
      update public.sessions set module_status = jsonb_set(module_status, '{analysis}', '"complete"') where id = s.id;
    elsif p_action = 'claim_report' and r.phase = 'report_pending' then
      -- Reserve a unique object version even if an older upload finishes late.
      update public.sessions set report_generation_version = greatest(report_generation_version, current_report_version) + 1
        where id = s.id returning report_generation_version into r.candidate_report_version;
      update public.analysis_runs set phase = 'report', candidate_report_version = r.candidate_report_version where run_id = r.run_id;
      update public.sessions set module_status = jsonb_set(module_status, '{report}', '"in_progress"'), report_status = 'generating' where id = s.id;
    elsif p_action = 'report_ready' and r.phase = 'report' then
      if r.candidate_report_version is null or r.candidate_report_version <= s.current_report_version
        then raise exception 'Stale PDF reservation'; end if;
      -- Advance across failed reservations atomically; SW-02 still registers the
      -- completed object, fixed expiry and completed run in this transaction.
      update public.sessions set current_report_version = r.candidate_report_version - 1 where id = s.id;
      perform public.publish_report_version(s.id, p_counselor_id, p_expected_version, r.run_id, r.candidate_report_version - 1);
      update public.analysis_runs set phase = 'ready' where run_id = r.run_id;
      update public.sessions set module_status = jsonb_set(module_status, '{report}', '"complete"'), report_status = 'ready' where id = s.id;
    else raise exception 'Stage already claimed or out of order'; end if;
  end if;
  select * into r from public.analysis_runs where run_id = r.run_id;
  return r;
end $$;
revoke all on function public.approve_and_start_analysis(uuid, uuid, integer, jsonb),
  public.transition_processing_run(uuid, uuid, uuid, integer, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.approve_and_start_analysis(uuid, uuid, integer, jsonb),
  public.transition_processing_run(uuid, uuid, uuid, integer, text, jsonb, text) to service_role;

-- CLI migration creation attempted; unavailable because ~/.supabase is read-only.
-- UTC timestamp arithmetic gives a calendar anniversary with month-end clamping.
create function public.correction_log_expiry(created timestamptz) returns timestamptz
language sql immutable strict security invoker set search_path = '' as $$
  select ((created at time zone 'UTC') + interval '12 months') at time zone 'UTC';
$$;
revoke all on function public.correction_log_expiry(timestamptz) from public, anon, authenticated;
grant execute on function public.correction_log_expiry(timestamptz) to service_role;

create function public.valid_correction_value(field text, value text) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select case
    when field ~ '^(ncae\.(strand_scores\.[0-9]+|overall_percentile)|nat\.(subjects\.[0-9]+|composite_score)|form_137\.(subjects\.[0-9]+\.grade|gwa))$'
      then value is null or value = '' or case when value ~ '^[0-9]{1,3}(\.[0-9]+)?$' then value::numeric between 0 and 100 else false end
    when field = 'form_137.school_year' then value is null or value = '' or value ~ '^[0-9]{4}-[0-9]{4}$'
    when field = 'ncae.recommended_strand' then value is null or value = '' or value ~* '^(ABM|HUMSS|STEM|GAS|TVL|Sports|Arts and Design)$'
    when field = 'nat.mastery_level' then value is null or value = '' or value ~* '^(absolutely no mastery|very low mastery|low mastery|average mastery|moving towards mastery|closely approximating mastery|mastered)$'
    else false end;
$$;
revoke all on function public.valid_correction_value(text, text) from public, anon;
grant execute on function public.valid_correction_value(text, text) to authenticated, service_role;

alter table public.correction_logs add column session_created_at timestamptz, add column expires_at timestamptz;
update public.correction_logs c set session_created_at = s.created_at, expires_at = public.correction_log_expiry(s.created_at)
  from public.sessions s where s.id = c.session_id;
-- Do not guess the provenance of legacy free text or label-bearing keys.
-- Invalid historic entries are removed rather than retained or copied elsewhere.
delete from public.correction_logs where expires_at is null or expires_at <= clock_timestamp()
  or not public.valid_correction_value(field_name, extracted_value)
  or not public.valid_correction_value(field_name, corrected_value);
alter table public.correction_logs alter column expires_at set not null, alter column session_created_at set not null;
alter table public.correction_logs drop constraint correction_logs_session_id_fkey;
alter table public.correction_logs add constraint correction_logs_academic_only check (
  public.valid_correction_value(field_name, extracted_value)
  and public.valid_correction_value(field_name, corrected_value));
create index correction_logs_expiry_idx on public.correction_logs(expires_at);

-- Insert remains part of SW-07's approval transaction. Capture the original
-- session clock before deletion; never trust supplied retention/time metadata.
create function public.stamp_correction_log() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then raise exception 'Correction logs are append-only'; end if;
  select created_at into new.session_created_at
    from public.sessions where id = new.session_id for key share;
  new.expires_at := public.correction_log_expiry(new.session_created_at);
  if new.expires_at is null or new.expires_at <= clock_timestamp() then
    raise exception 'Correction session unavailable';
  end if;
  new.correction_timestamp := clock_timestamp();
  return new;
end $$;
revoke all on function public.stamp_correction_log() from public, anon, authenticated;
grant execute on function public.stamp_correction_log() to service_role;
create trigger correction_log_stamp before insert or update on public.correction_logs
  for each row execute function public.stamp_correction_log();

-- Live admin-managed Auth state, not user_metadata or stale role claims.
-- A narrowly scoped privileged lookup is necessary to check private Auth rows.
create function private.is_accuracy_evaluator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join auth.sessions s on s.user_id = u.id
    where u.id = (select auth.uid())
      and s.id::text = (select auth.jwt()->>'session_id')
      and (s.not_after is null or s.not_after > now())
      and (select (auth.jwt()->>'exp')::bigint) > extract(epoch from now())
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
      and u.raw_app_meta_data->>'role' = 'accuracy_evaluator'
      and u.raw_app_meta_data->'evaluation_authorized' = 'true'::jsonb
  );
$$;
revoke all on function private.is_accuracy_evaluator() from public, anon, service_role;
grant execute on function private.is_accuracy_evaluator() to authenticated;
drop policy if exists correction_logs_own on public.correction_logs;
revoke all on public.correction_logs from anon, authenticated;
grant select(session_id, field_name, extracted_value, corrected_value, correction_timestamp)
  on public.correction_logs to authenticated;
create policy correction_logs_evaluation on public.correction_logs for select to authenticated
  using ((select private.is_accuracy_evaluator()) and expires_at > statement_timestamp());
-- A restrictive policy also constrains any additional permissive read policy.
create policy correction_logs_evaluation_guard on public.correction_logs as restrictive for select to authenticated
  using ((select private.is_accuracy_evaluator()) and expires_at > statement_timestamp());
revoke update on public.correction_logs from service_role;

create function public.purge_expired_correction_logs() returns bigint
language plpgsql security invoker set search_path = '' as $$
declare removed bigint;
begin
  delete from public.correction_logs where expires_at <= clock_timestamp();
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke all on function public.purge_expired_correction_logs() from public, anon, authenticated;
grant execute on function public.purge_expired_correction_logs() to service_role;

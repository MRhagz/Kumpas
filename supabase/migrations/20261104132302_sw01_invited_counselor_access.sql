-- SW-01 / SRS 2.4, 2.5, Security / SDD 2.6.
-- No user/session data is deleted or automatically promoted to counselor.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Live Auth state avoids stale role claims and rejects revoked/expired sessions.
-- This privileged lookup returns only the caller's access state, never Auth rows.
create function private.counselor_state()
returns text
language sql stable security definer
set search_path = ''
as $$
  select case when u.raw_app_meta_data->'counselor_activated' = 'true'::jsonb
    then 'active' else 'invited' end
  from auth.users u
  join auth.sessions s on s.user_id = u.id
  where u.id = (select auth.uid())
    and s.id::text = (select auth.jwt()->>'session_id')
    and (s.not_after is null or s.not_after > now())
    and (select (auth.jwt()->>'exp')::bigint) > extract(epoch from now())
    and u.invited_at is not null
    and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous, false)
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now())
    and u.raw_app_meta_data->>'role' = 'counselor'
  limit 1;
$$;
revoke all on function private.counselor_state() from public, anon, service_role;
grant execute on function private.counselor_state() to authenticated;

create function public.counselor_access()
returns text
language sql stable security invoker
set search_path = ''
as $$ select private.counselor_state(); $$;
revoke all on function public.counselor_access() from public, anon, service_role;
grant execute on function public.counselor_access() to authenticated;

create index if not exists sessions_counselor_id_idx on public.sessions(counselor_id);

-- Workflow mutations already run through independently authorized server routes.
-- Read-only browser grants prevent forged ownership, approval and expiry updates.
revoke all on public.sessions, public.session_notes, public.extraction_results,
  public.ranked_recommendations, public.recommendation_sources, public.correction_logs
  from anon, authenticated;
grant select on public.sessions, public.session_notes, public.extraction_results,
  public.ranked_recommendations, public.recommendation_sources to authenticated;
-- Evaluator-only correction access is implemented by SW-08; counselors get none.

drop policy if exists sessions_own on public.sessions;
create policy sessions_own on public.sessions for select to authenticated
using (
  (select private.counselor_state()) = 'active'
  and counselor_id = (select auth.uid())
  and status in ('active', 'completed') and expires_at > now()
);

drop policy if exists session_notes_own on public.session_notes;
create policy session_notes_own on public.session_notes for select to authenticated
using (
  counselor_id = (select auth.uid())
  and exists (select 1 from public.sessions s where s.id = session_notes.session_id)
);
drop policy if exists extraction_results_own on public.extraction_results;
create policy extraction_results_own on public.extraction_results for select to authenticated
using (
  counselor_id = (select auth.uid())
  and exists (select 1 from public.sessions s where s.id = extraction_results.session_id)
);
-- Recommendation policies already join the owning session and inherit its guard.
drop policy if exists correction_logs_own on public.correction_logs;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
using (id = (select auth.uid()) and (select private.counselor_state()) = 'active');
create policy profiles_update_own on public.profiles for update to authenticated
using (id = (select auth.uid()) and (select private.counselor_state()) = 'active')
with check (id = (select auth.uid()) and (select private.counselor_state()) = 'active');
revoke update on public.profiles from authenticated;
grant update(full_name, school) on public.profiles to authenticated;

insert into storage.buckets(id, name, public)
values ('kumpas-reports', 'kumpas-reports', false)
on conflict (id) do update set public = false;
update storage.buckets set public = false where id = 'kumpas-documents';

-- Private objects are delivered only by owner-authorized application endpoints.
-- SELECT would also allow clients to mint transferable signed URLs. Deny direct
-- client access even for an owner; service-role delivery bypasses this policy.
-- A restrictive guard also constrains older permissive storage policies.
create policy counselor_private_objects_guard on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id not in ('kumpas-documents', 'kumpas-reports'))
with check (bucket_id not in ('kumpas-documents', 'kumpas-reports'));

-- Trigger functions are not application RPCs.
revoke all on function public.handle_new_user() from public, anon, authenticated;

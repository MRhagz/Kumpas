-- Raw uploads are private, short-lived staging objects, never recovery drafts.
alter table public.extraction_artifact_cleanup add column bucket_id text not null
  default 'kumpas-documents' check (bucket_id in ('kumpas-documents', 'kumpas-intake-temp'));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('kumpas-intake-temp', 'kumpas-intake-temp', false, 10000000,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/octet-stream']);

-- The cleanup parent exists before authorization is returned. Its deletion
-- removes staging metadata only after the Storage deletion has succeeded.
-- Neither row depends on the session surviving cancellation or deletion.
create table public.temporary_intake_uploads (
  id uuid primary key references public.extraction_artifact_cleanup(id) on delete cascade,
  session_id uuid not null,
  counselor_id uuid not null,
  object_path text not null unique,
  document_type text not null check (document_type in ('form_137', 'ncae', 'nat', 'notes')),
  file_size integer not null check (file_size between 1 and 10000000),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/octet-stream')),
  extraction_id uuid,
  upload_token uuid,
  notes_revision integer,
  state text not null default 'pending' check (state in ('pending', 'processing', 'cleanup')),
  expires_at timestamptz not null,
  check ((document_type = 'notes' and notes_revision is not null and notes_revision >= 0 and extraction_id is null and upload_token is null)
    or (document_type <> 'notes' and notes_revision is null and extraction_id is not null and upload_token is not null))
);
create index temporary_upload_session on public.temporary_intake_uploads(session_id, document_type, expires_at);
alter table public.temporary_intake_uploads enable row level security;
revoke all on public.temporary_intake_uploads from public, anon, authenticated;
grant select, insert, update, delete on public.temporary_intake_uploads to service_role;
-- Only metadata needed for upload authorization is visible to its owner.
grant select(id, session_id, counselor_id, object_path, state, expires_at)
  on public.temporary_intake_uploads to authenticated;
create policy temporary_upload_owner on public.temporary_intake_uploads for select to authenticated
using (counselor_id = (select auth.uid()) and (select public.counselor_access()) = 'active');

-- A restrictive policy also wins over any older overly broad Storage policy.
-- No client SELECT/UPDATE/DELETE means no downloads, signed reads or upserts.
create policy temporary_upload_anon_guard on storage.objects as restrictive for all to anon
using (bucket_id <> 'kumpas-intake-temp') with check (bucket_id <> 'kumpas-intake-temp');
create policy temporary_upload_guard on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'kumpas-intake-temp')
with check (bucket_id <> 'kumpas-intake-temp' or (
  (select public.counselor_access()) = 'active' and exists (
    select 1 from public.temporary_intake_uploads u join public.sessions s on s.id = u.session_id
    where u.object_path = name and u.counselor_id = (select auth.uid())
      and u.state = 'pending' and u.expires_at > now()
      and s.counselor_id = (select auth.uid()) and s.status = 'active' and s.expires_at > now()
  )
));
create policy temporary_upload_insert on storage.objects for insert to authenticated
with check (bucket_id = 'kumpas-intake-temp');
create policy temporary_upload_service on storage.objects for all to service_role
using (bucket_id = 'kumpas-intake-temp') with check (bucket_id = 'kumpas-intake-temp');

create function public.prepare_temporary_upload(p_session_id uuid, p_counselor_id uuid,
  p_document_type text, p_size integer, p_mime_type text, p_replace_id uuid default null,
  p_notes_revision integer default null) returns public.temporary_intake_uploads
language plpgsql security invoker set search_path = '' as $$
declare r public.temporary_intake_uploads; claim public.extraction_results;
  uid uuid := gen_random_uuid(); path text; deadline timestamptz;
begin
  perform public.guard_intake_session(p_session_id, p_counselor_id);
  if p_size is null or p_size not between 1 and 10000000
    or p_document_type is null or p_document_type not in ('form_137', 'ncae', 'nat', 'notes')
    or p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/octet-stream') then
    raise exception 'Invalid upload' using errcode = '22023';
  end if;
  if p_document_type = 'notes' then
    if p_mime_type = 'application/pdf' or p_replace_id is not null or p_notes_revision is null
      or not exists(select 1 from public.session_notes where session_id = p_session_id
        and counselor_id = p_counselor_id and draft_revision = p_notes_revision)
      or exists(select 1 from public.temporary_intake_uploads where session_id = p_session_id
        and document_type = 'notes' and state <> 'cleanup' and expires_at > clock_timestamp()) then
      raise exception 'Notes changed or upload in progress' using errcode = '40001';
    end if;
  else
    if p_notes_revision is not null then raise exception 'Invalid upload' using errcode = '22023'; end if;
    claim := public.claim_academic_upload(p_session_id, p_counselor_id, p_document_type, p_replace_id);
  end if;
  select least(expires_at, clock_timestamp() + interval '10 minutes') into deadline
    from public.sessions where id = p_session_id;
  path := p_session_id::text || '/' || uid::text;
  insert into public.extraction_artifact_cleanup(id, session_id, object_path, bucket_id, next_attempt_at)
    values (uid, p_session_id, path, 'kumpas-intake-temp', deadline);
  insert into public.temporary_intake_uploads(id, session_id, counselor_id, object_path,
    document_type, file_size, mime_type, extraction_id, upload_token, notes_revision, expires_at)
    values (uid, p_session_id, p_counselor_id, path, p_document_type, p_size, p_mime_type,
      claim.id, claim.upload_token, p_notes_revision, deadline) returning * into r;
  return r;
end $$;

create function public.claim_temporary_upload(p_session_id uuid, p_counselor_id uuid, p_id uuid)
returns public.temporary_intake_uploads language plpgsql security invoker set search_path = '' as $$
declare r public.temporary_intake_uploads; deadline timestamptz;
begin
  perform public.guard_intake_session(p_session_id, p_counselor_id);
  select * into r from public.temporary_intake_uploads where id = p_id
    and session_id = p_session_id and counselor_id = p_counselor_id for update;
  if r.id is null then raise exception 'Upload unavailable' using errcode = 'P0002'; end if;
  if r.state <> 'pending' or r.expires_at <= clock_timestamp()
    or not exists(select 1 from storage.objects where bucket_id = 'kumpas-intake-temp' and name = r.object_path) then
    raise exception 'Upload incomplete, expired or already processing' using errcode = '40001';
  end if;
  select least(expires_at, clock_timestamp() + interval '6 minutes') into deadline
    from public.sessions where id = p_session_id;
  if r.document_type <> 'notes' then
    update public.extraction_results set upload_expires_at = deadline where id = r.extraction_id
      and upload_token = r.upload_token and upload_expires_at > clock_timestamp();
    if not found then raise exception 'Stale upload' using errcode = '40001'; end if;
  elsif not exists(select 1 from public.session_notes where session_id = p_session_id
      and counselor_id = p_counselor_id and draft_revision = r.notes_revision) then
    raise exception 'Notes changed' using errcode = '40001';
  end if;
  update public.temporary_intake_uploads set state = 'processing', expires_at = deadline
    where id = r.id returning * into r;
  update public.extraction_artifact_cleanup set next_attempt_at = deadline where id = r.id;
  return r;
end $$;

create function public.finish_temporary_upload(p_session_id uuid, p_counselor_id uuid, p_id uuid,
  p_expired_only boolean default false) returns void
language plpgsql security invoker set search_path = '' as $$
declare r public.temporary_intake_uploads;
begin
  -- Always lock parent before child, including cancellation and expired work.
  perform id from public.sessions where id = p_session_id for update;
  select * into r from public.temporary_intake_uploads where id = p_id
    and session_id = p_session_id and counselor_id = p_counselor_id for update;
  if r.id is null or r.state = 'cleanup' then return; end if;
  if p_expired_only and r.expires_at > clock_timestamp() and exists (
    select 1 from public.sessions where id = p_session_id and status = 'active' and expires_at > clock_timestamp()
  ) then return; end if;
  if r.extraction_id is not null then perform public.release_academic_upload(r.extraction_id, r.upload_token); end if;
  update public.temporary_intake_uploads set state = 'cleanup' where id = r.id;
  update public.extraction_artifact_cleanup set next_attempt_at = clock_timestamp() where id = r.id;
end $$;

create function public.queue_temporary_upload_cleanup() returns void
language plpgsql security invoker set search_path = '' as $$
declare r record;
begin
  for r in select u.id, u.session_id, u.counselor_id from public.temporary_intake_uploads u
    where u.state <> 'cleanup' and (u.expires_at <= clock_timestamp() or not exists (
      select 1 from public.sessions s where s.id = u.session_id and s.status = 'active' and s.expires_at > clock_timestamp()
    )) order by u.expires_at limit 100 loop
    perform public.finish_temporary_upload(r.session_id, r.counselor_id, r.id, true);
  end loop;
  insert into public.extraction_artifact_cleanup(session_id, object_path, bucket_id)
    select case when split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(o.name, '/', 1)::uuid else '00000000-0000-0000-0000-000000000000'::uuid end,
      o.name, 'kumpas-intake-temp' from storage.objects o where o.bucket_id = 'kumpas-intake-temp'
      and not exists(select 1 from public.temporary_intake_uploads u where u.object_path = o.name)
    on conflict (object_path) do nothing;
end $$;

create or replace function public.extraction_cleanup_pending(p_session_id uuid default null) returns boolean
language sql security invoker set search_path = '' as $$
  select exists(select 1 from public.extraction_artifact_cleanup q
    where (p_session_id is null or q.session_id = p_session_id) and not exists (
      select 1 from public.temporary_intake_uploads u join public.sessions s on s.id = u.session_id
      where u.id = q.id and u.state <> 'cleanup' and u.expires_at > clock_timestamp()
        and s.status = 'active' and s.expires_at > clock_timestamp()
    ));
$$;

-- Keep already-deployed workers from deleting a new bucket's queue entry after
-- attempting removal from the old hard-coded bucket during a rolling rollout.
create or replace function public.claim_extraction_cleanup(p_limit integer, p_session_id uuid default null)
returns setof public.extraction_artifact_cleanup
language sql security invoker set search_path = '' as $$
  update public.extraction_artifact_cleanup set lease_until = clock_timestamp() + interval '5 minutes',
    lease_token = gen_random_uuid(), attempts = attempts + 1
  where id in (select id from public.extraction_artifact_cleanup
    where bucket_id = 'kumpas-documents' and next_attempt_at <= clock_timestamp()
      and (lease_until is null or lease_until <= clock_timestamp())
      and (p_session_id is null or session_id = p_session_id)
    order by next_attempt_at limit greatest(0, least(p_limit, 100)) for update skip locked)
  returning *;
$$;

create function public.claim_intake_cleanup(p_limit integer, p_session_id uuid default null)
returns setof public.extraction_artifact_cleanup
language sql security invoker set search_path = '' as $$
  update public.extraction_artifact_cleanup set lease_until = clock_timestamp() + interval '5 minutes',
    lease_token = gen_random_uuid(), attempts = attempts + 1
  where id in (select q.id from public.extraction_artifact_cleanup q
    where q.next_attempt_at <= clock_timestamp() and (q.lease_until is null or q.lease_until <= clock_timestamp())
      and (p_session_id is null or q.session_id = p_session_id)
      -- Inventory must release the document reservation before its tracking
      -- row can cascade away, even when the bounded sweep leaves a backlog.
      and not exists(select 1 from public.temporary_intake_uploads u where u.id = q.id and u.state <> 'cleanup')
    order by q.next_attempt_at limit greatest(0, least(p_limit, 100)) for update of q skip locked)
  returning *;
$$;

-- Approval already checks read_intake_draft under the same parent lock.
create or replace function public.read_intake_draft(p_session_id uuid, p_counselor_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare docs jsonb; notes jsonb; version integer;
begin
  perform public.guard_intake_session(p_session_id, p_counselor_id);
  select current_profile_version into version from public.sessions where id = p_session_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'document_type', document_type,
    'structured_data', structured_data, 'original_data', original_data, 'evidence_state', evidence_state,
    'provenance', provenance, 'draft_revision', draft_revision) order by document_type), '[]') into docs
    from public.extraction_results where session_id = p_session_id and structured_data ? 'type';
  select jsonb_build_object('careerGoal', career_goal, 'interests', interests, 'financial', financial,
    'concerns', concerns, 'impression', impression, 'revision', draft_revision,
    'source', extraction_source, 'original', original_notes) into notes
    from public.session_notes where session_id = p_session_id and counselor_id = p_counselor_id;
  return jsonb_build_object('profileVersion', version, 'documents', docs, 'notes', notes,
    'uploadPending', exists(select 1 from public.extraction_results where session_id = p_session_id
      and (not (structured_data ? 'type') or (upload_token is not null and upload_expires_at > clock_timestamp())))
    or exists(select 1 from public.temporary_intake_uploads where session_id = p_session_id
      and state <> 'cleanup' and expires_at > clock_timestamp()));
end $$;

revoke all on function public.prepare_temporary_upload(uuid, uuid, text, integer, text, uuid, integer),
  public.claim_temporary_upload(uuid, uuid, uuid), public.finish_temporary_upload(uuid, uuid, uuid, boolean),
  public.queue_temporary_upload_cleanup(), public.claim_intake_cleanup(integer, uuid) from public, anon, authenticated;
grant execute on function public.prepare_temporary_upload(uuid, uuid, text, integer, text, uuid, integer),
  public.claim_temporary_upload(uuid, uuid, uuid), public.finish_temporary_upload(uuid, uuid, uuid, boolean),
  public.queue_temporary_upload_cleanup(), public.claim_intake_cleanup(integer, uuid) to service_role;

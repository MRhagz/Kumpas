-- SW-06: drafts are editable evidence, never approved profile versions.
alter table public.extraction_results
  add column original_data jsonb,
  add column evidence_state text not null default 'provided'
    check (evidence_state in ('provided', 'unreadable', 'unsupported')),
  add column provenance jsonb not null default '{}',
  add column draft_revision integer not null default 0 check (draft_revision >= 0);
update public.extraction_results set original_data = structured_data;

alter table public.session_notes
  add column draft_revision integer not null default 0 check (draft_revision >= 0),
  add column extraction_source jsonb,
  add column original_notes jsonb;

-- No FK: failed cleanup must survive deletion of the session and its drafts.
create table public.extraction_artifact_cleanup (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  object_path text not null unique,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  last_error text check (last_error in ('storage_delete_failed'))
);
create index extraction_cleanup_due on public.extraction_artifact_cleanup(next_attempt_at);
alter table public.extraction_artifact_cleanup enable row level security;
revoke all on public.extraction_artifact_cleanup from public, anon, authenticated;
grant select, insert, update, delete on public.extraction_artifact_cleanup to service_role;

-- Register legacy images before any reference can be lost. No objects are deleted here.
insert into public.extraction_artifact_cleanup(session_id, object_path)
  select session_id, redacted_image_path from public.extraction_results
  where redacted_image_path is not null on conflict (object_path) do nothing;
create function public.queue_extraction_artifact() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if old.redacted_image_path is not null then
    insert into public.extraction_artifact_cleanup(session_id, object_path)
      values (old.session_id, old.redacted_image_path) on conflict (object_path) do nothing;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger extraction_artifact_before_delete before delete on public.extraction_results
  for each row execute function public.queue_extraction_artifact();
create trigger extraction_artifact_before_update before update of redacted_image_path on public.extraction_results
  for each row when (old.redacted_image_path is distinct from new.redacted_image_path)
  execute function public.queue_extraction_artifact();

create function public.guard_intake_session(p_session_id uuid, p_counselor_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null or s.counselor_id is distinct from p_counselor_id
    or s.status <> 'active' or s.expires_at <= clock_timestamp() then
    raise exception 'Session unavailable' using errcode = 'P0002';
  end if;
  if s.current_profile_version <> 0 then
    raise exception 'Approved inputs are locked; start a new session' using errcode = '40001';
  end if;
end $$;

create function public.claim_academic_upload(
  p_session_id uuid, p_counselor_id uuid, p_document_type text, p_replace_id uuid
) returns public.extraction_results
language plpgsql security invoker set search_path = public as $$
declare r public.extraction_results;
begin
  perform public.guard_intake_session(p_session_id, p_counselor_id);
  if p_document_type not in ('ncae', 'form_137', 'nat') or p_document_type is null then
    raise exception 'Unsupported document type' using errcode = '22023';
  end if;
  select * into r from public.extraction_results
    where session_id = p_session_id and document_type = p_document_type for update;
  if (r.upload_token is not null and r.upload_expires_at > clock_timestamp())
    or (r.id is null and p_replace_id is not null)
    or (r.structured_data ? 'type' and r.id is distinct from p_replace_id)
    or (r.id is not null and not (r.structured_data ? 'type') and p_replace_id is not null) then
    raise exception 'Document changed or upload in progress; reload and retry' using errcode = '40001';
  end if;
  if r.id is null then
    insert into public.extraction_results(session_id, counselor_id, document_type, structured_data, upload_token, upload_expires_at)
      values (p_session_id, p_counselor_id, p_document_type, '{}', gen_random_uuid(), clock_timestamp() + interval '10 minutes') returning * into r;
  else
    update public.extraction_results set upload_token = gen_random_uuid(),
      upload_expires_at = clock_timestamp() + interval '10 minutes' where id = r.id returning * into r;
  end if;
  return r;
end $$;

create function public.finish_academic_upload(
  p_session_id uuid, p_counselor_id uuid, p_id uuid, p_token uuid,
  p_data jsonb, p_evidence text, p_provenance jsonb
) returns public.extraction_results
language plpgsql security invoker set search_path = public as $$
declare r public.extraction_results;
begin
  perform public.guard_intake_session(p_session_id, p_counselor_id);
  update public.extraction_results set structured_data = p_data, original_data = p_data,
    evidence_state = p_evidence, provenance = p_provenance, draft_revision = draft_revision + 1,
    redacted_image_path = null, upload_token = null, upload_expires_at = null
    where id = p_id and session_id = p_session_id and counselor_id = p_counselor_id
      and upload_token = p_token and upload_expires_at > clock_timestamp() returning * into r;
  if r.id is null then raise exception 'Stale upload' using errcode = '40001'; end if;
  return r;
end $$;

create function public.release_academic_upload(p_id uuid, p_token uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  delete from public.extraction_results where id = p_id and upload_token = p_token and not (structured_data ? 'type');
  update public.extraction_results set upload_token = null, upload_expires_at = null
    where id = p_id and upload_token = p_token;
end $$;

create function public.remove_academic_upload(p_session_id uuid, p_counselor_id uuid, p_id uuid, p_token uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform public.guard_intake_session(p_session_id, p_counselor_id);
  delete from public.extraction_results where id = p_id and session_id = p_session_id
    and counselor_id = p_counselor_id and upload_token = p_token and upload_expires_at > clock_timestamp();
  if not found then raise exception 'Stale document' using errcode = '40001'; end if;
end $$;

create function public.save_extraction_draft(
  p_session_id uuid, p_counselor_id uuid, p_id uuid, p_expected_revision integer, p_data jsonb
) returns public.extraction_results
language plpgsql security invoker set search_path = public as $$
declare r public.extraction_results;
begin
  perform public.guard_intake_session(p_session_id, p_counselor_id);
  update public.extraction_results set structured_data = p_data, draft_revision = draft_revision + 1
    where id = p_id and session_id = p_session_id and counselor_id = p_counselor_id
      and draft_revision = p_expected_revision and evidence_state = 'provided'
      and (upload_token is null or upload_expires_at <= clock_timestamp()) returning * into r;
  if r.id is null then raise exception 'Draft changed; reload before editing' using errcode = '40001'; end if;
  return r;
end $$;

create function public.save_intake_notes(
  p_session_id uuid, p_counselor_id uuid, p_expected_revision integer,
  p_notes jsonb, p_source jsonb, p_extracted boolean
) returns public.session_notes
language plpgsql security invoker set search_path = public as $$
declare r public.session_notes;
begin
  perform public.guard_intake_session(p_session_id, p_counselor_id);
  update public.session_notes set career_goal = p_notes->>'careerGoal', interests = p_notes->>'interests',
    financial = p_notes->>'financial', concerns = p_notes->>'concerns', impression = p_notes->>'impression',
    extraction_source = case when p_extracted then p_source else extraction_source end,
    original_notes = case when p_extracted then p_notes else original_notes end,
    draft_revision = draft_revision + 1, updated_at = clock_timestamp()
    where session_id = p_session_id and counselor_id = p_counselor_id
      and draft_revision = p_expected_revision returning * into r;
  if r.id is null then raise exception 'Notes changed; reload before editing' using errcode = '40001'; end if;
  return r;
end $$;

create function public.read_intake_draft(p_session_id uuid, p_counselor_id uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare docs jsonb; notes jsonb;
begin
  perform public.guard_intake_session(p_session_id, p_counselor_id);
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'document_type', document_type,
    'structured_data', structured_data, 'original_data', original_data, 'evidence_state', evidence_state,
    'provenance', provenance, 'draft_revision', draft_revision)), '[]') into docs
    from public.extraction_results where session_id = p_session_id and structured_data ? 'type';
  select jsonb_build_object('careerGoal', career_goal, 'interests', interests, 'financial', financial,
    'concerns', concerns, 'impression', impression, 'revision', draft_revision,
    'source', extraction_source, 'original', original_notes) into notes
    from public.session_notes where session_id = p_session_id and counselor_id = p_counselor_id;
  return jsonb_build_object('documents', docs, 'notes', notes,
    'uploadPending', exists(select 1 from public.extraction_results where session_id = p_session_id
      and upload_token is not null and upload_expires_at > clock_timestamp()));
end $$;

create function public.claim_extraction_cleanup(p_limit integer, p_session_id uuid default null)
returns setof public.extraction_artifact_cleanup
language sql security invoker set search_path = public as $$
  update public.extraction_artifact_cleanup set lease_until = clock_timestamp() + interval '5 minutes',
    lease_token = gen_random_uuid(), attempts = attempts + 1
  where id in (select id from public.extraction_artifact_cleanup
    where next_attempt_at <= clock_timestamp() and (lease_until is null or lease_until <= clock_timestamp())
      and (p_session_id is null or session_id = p_session_id)
    order by next_attempt_at limit greatest(0, least(p_limit, 100)) for update skip locked)
  returning *;
$$;

-- Internal helpers and trigger functions are never browser RPCs.
do $$
declare r record;
begin
  for r in select oid::regprocedure as signature from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('queue_extraction_artifact', 'guard_intake_session', 'claim_academic_upload',
      'finish_academic_upload', 'release_academic_upload', 'remove_academic_upload',
      'save_extraction_draft', 'save_intake_notes', 'read_intake_draft', 'claim_extraction_cleanup') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
    execute format('grant execute on function %s to service_role', r.signature);
  end loop;
end $$;

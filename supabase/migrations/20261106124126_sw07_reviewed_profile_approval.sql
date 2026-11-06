-- The CLI could not create this file: its ~/.supabase state is read-only.
-- Edits remain drafts; only an explicit, revision-checked approval starts a run.
create or replace function public.guard_intake_session(p_session_id uuid, p_counselor_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null or s.counselor_id is distinct from p_counselor_id or p_counselor_id is null
    or s.status <> 'active' or s.expires_at <= clock_timestamp() then
    raise exception 'Session unavailable' using errcode = 'P0002';
  end if;
end $$;

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
      and (not (structured_data ? 'type') or (upload_token is not null and upload_expires_at > clock_timestamp()))));
end $$;

-- All intake RPCs lock the parent first. Invalidation shares that lock with stage
-- publication/review, including when the previous run is already completed.
create function public.invalidate_reviewed_inputs() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions; sid uuid;
begin
  if tg_op = 'DELETE' then sid := old.session_id; else sid := new.session_id; end if;
  select * into s from public.sessions where id = sid for update;
  if s.status = 'active' and s.expires_at > clock_timestamp() and exists (
    select 1 from public.profile_versions where session_id = sid
      and profile_version = s.current_profile_version and approved_at is not null
  ) then
    -- Reserve an unapproved revision once. It cannot be analyzed or recovered as
    -- approved work. The previous immutable approved snapshot remains untouched.
    perform public.save_profile_version(sid, s.counselor_id, s.current_profile_version, '{"requiresReview":true}', false);
    update public.sessions set approved_profile = null,
      module_status = '{"intake":"in_progress","profile":"in_progress","analysis":"not_started","report":"not_started"}',
      report_status = 'not_started' where id = sid;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger academic_inputs_added_removed after insert or delete on public.extraction_results
  for each row execute function public.invalidate_reviewed_inputs();
create trigger academic_inputs_changed after update on public.extraction_results
  for each row when ((old.structured_data, old.provenance, old.evidence_state)
    is distinct from (new.structured_data, new.provenance, new.evidence_state)
    or (new.upload_token is not null and old.upload_token is distinct from new.upload_token))
  execute function public.invalidate_reviewed_inputs();
create trigger reviewed_notes_changed after update on public.session_notes
  for each row when ((old.career_goal, old.interests, old.financial, old.concerns, old.impression, old.extraction_source)
    is distinct from (new.career_goal, new.interests, new.financial, new.concerns, new.impression, new.extraction_source))
  execute function public.invalidate_reviewed_inputs();

-- Cleanup may run after expiry/cancellation. It still takes the parent before
-- touching child rows, matching upload claims and avoiding lock-order inversion.
create or replace function public.release_academic_upload(p_id uuid, p_token uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform id from public.sessions where id = (select session_id from public.extraction_results where id = p_id) for update;
  delete from public.extraction_results where id = p_id and upload_token = p_token and not (structured_data ? 'type');
  update public.extraction_results set upload_token = null, upload_expires_at = null
    where id = p_id and upload_token = p_token;
end $$;

create function public.approve_reviewed_inputs(
  p_session_id uuid, p_counselor_id uuid, p_expected_version integer,
  p_notes_revision integer, p_documents jsonb, p_profile jsonb, p_corrections jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare s public.sessions; draft jsonb; refs jsonb; profile jsonb; t timestamptz;
begin
  perform public.guard_intake_session(p_session_id, p_counselor_id);
  select * into s from public.sessions where id = p_session_id;
  draft := public.read_intake_draft(p_session_id, p_counselor_id);
  select coalesce(jsonb_object_agg(d->>'id', d->'draft_revision'), '{}') into refs
    from jsonb_array_elements(draft->'documents') d;
  if s.current_profile_version is distinct from p_expected_version
    or (draft->'notes'->>'revision')::integer is distinct from p_notes_revision
    or refs is distinct from p_documents or (draft->>'uploadPending')::boolean
    or p_profile->'counselorNotes' is distinct from ((draft->'notes') - 'revision' - 'source' - 'original') then
    raise exception 'Inputs changed; review before approving' using errcode = '40001';
  end if;
  t := clock_timestamp();
  profile := p_profile || jsonb_build_object('profileVersion', s.current_profile_version + 1,
    'confirmedAt', t, 'sessionTimestamp', t);
  insert into public.profile_versions(session_id, profile_version, counselor_id, profile, created_at, approved_at)
    values (s.id, s.current_profile_version + 1, s.counselor_id, profile, t, t);
  update public.sessions set current_profile_version = current_profile_version + 1, current_run_id = null,
    approved_profile = profile,
    module_status = '{"intake":"complete","profile":"complete","analysis":"not_started","report":"not_started"}',
    report_status = 'not_started' where id = s.id;
  perform public.start_analysis_run(s.id, s.counselor_id, s.current_profile_version + 1, null);
  insert into public.correction_logs(session_id, field_name, extracted_value, corrected_value)
    select s.id, c->>'field_name', c->>'extracted_value', c->>'corrected_value'
    from jsonb_array_elements(p_corrections) c;
  return profile;
end $$;
revoke all on function public.invalidate_reviewed_inputs(),
  public.approve_reviewed_inputs(uuid, uuid, integer, integer, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.invalidate_reviewed_inputs(),
  public.approve_reviewed_inputs(uuid, uuid, integer, integer, jsonb, jsonb, jsonb) to service_role;

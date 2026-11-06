-- Run only in an empty disposable PostgreSQL database. No production target.
\set ON_ERROR_STOP on
begin;
create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}',
      invited_at timestamptz, email_confirmed_at timestamptz, is_anonymous boolean default false, banned_until timestamptz, deleted_at timestamptz);
    create table auth.sessions(id uuid primary key, user_id uuid, not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims', true)::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text, name text);
    grant usage on schema storage to service_role;
    grant all on storage.objects to service_role;

\ir ../migrations/20260523000000_module2_sessions.sql
\ir ../migrations/20260523000001_module2_grants.sql
\ir ../migrations/20260523000002_module3_recommendations.sql
\ir ../migrations/20260524000000_create_profiles.sql
\ir ../migrations/20260524000001_tighten_session_security.sql
\ir ../migrations/20260524000002_module5_session_progress.sql
\ir ../migrations/20261104132302_sw01_invited_counselor_access.sql
\ir ../migrations/20261104144015_sw03_academic_upload_validation.sql
\ir ../migrations/20261105030355_sw02_versioned_contracts.sql
\ir ../migrations/20261105081447_sw15_processing_budget.sql
\ir ../migrations/20261106110326_sw06_extraction_drafts_cleanup.sql
\ir ../migrations/20261106124126_sw07_reviewed_profile_approval.sql
\ir ../migrations/20261106132602_sw08_restricted_correction_logs.sql
\ir ../migrations/20261106140122_sw23_retention_cleanup_restore.sql

insert into sessions(id,counselor_id,created_at,approved_profile,current_profile_version,current_report_version,current_run_id)
 values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
   clock_timestamp()-interval '25 hours','{"private":"notes"}',1,1,gen_random_uuid());
insert into session_notes(session_id,counselor_id,career_goal) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','PRIVATE');
insert into report_versions select id,1,counselor_id,1,current_run_id,id::text||'/1.pdf',
 statement_timestamp()-interval '1 hour',statement_timestamp()-interval '1 hour'+interval '24 hours','draft',null
 from sessions;
-- Use one timestamp for the exact generation/expiry constraint.

set local role service_role;
select purge_session_content('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$ begin
 assert (select approved_profile is null and status='expired' and draft_purged_at is not null from sessions);
 assert (select count(*)=0 from session_notes);
 assert (select count(*)=1 from report_versions);
 assert (select count(*)=0 from report_artifact_cleanup);
end $$;
-- Explicit termination overrides the remaining PDF lifetime.
update sessions set status='cancelled' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select purge_session_content('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select purge_session_content('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$ begin
 assert (select count(*)=0 from sessions);
 assert (select count(*)=0 from report_versions);
 assert (select count(*)=1 from report_artifact_cleanup);
 assert (select count(*)=1 from retention_tombstones);
 assert (select count(*)=1 from claim_report_cleanup(50));
 assert (select count(*)=0 from claim_report_cleanup(50));
 assert report_cleanup_pending();
end $$;
reset role;
insert into storage.objects(bucket_id,name) values ('kumpas-documents','orphan/image.jpg');
set local role service_role;
select queue_legacy_document_cleanup();
select queue_legacy_document_cleanup();
do $$ begin assert (select count(*)=1 from extraction_artifact_cleanup where object_path='orphan/image.jpg'); end $$;
reset role;
do $$ begin
 assert not has_function_privilege('authenticated','public.reapply_retention_tombstones(jsonb)','execute');
 assert not has_function_privilege('anon','public.claim_report_cleanup(integer)','execute');
 assert not has_table_privilege('authenticated','public.retention_tombstones','select');
 assert not exists(select 1 from pg_proc where oid in ('public.purge_session_content(uuid)'::regprocedure,
   'public.reapply_retention_tombstones(jsonb)'::regprocedure) and prosecdef);
end $$;
rollback;
\echo SW-23 PostgreSQL lifecycle grants, independent clocks, tombstones and orphan inventory passed

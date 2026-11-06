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
    create table storage.objects(bucket_id text);

\ir ../migrations/20260523000000_module2_sessions.sql
\ir ../migrations/20260523000001_module2_grants.sql
\ir ../migrations/20260523000002_module3_recommendations.sql
\ir ../migrations/20260524000000_create_profiles.sql
\ir ../migrations/20260524000001_tighten_session_security.sql
\ir ../migrations/20260524000002_module5_session_progress.sql
\ir ../migrations/20261104132302_sw01_invited_counselor_access.sql
\ir ../migrations/20261106132602_sw08_restricted_correction_logs.sql
insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values
 ('11111111-1111-4111-8111-111111111111',now(),'{"role":"counselor","counselor_activated":true}'),
 ('22222222-2222-4222-8222-222222222222',now(),'{"role":"accuracy_evaluator","evaluation_authorized":true}');
insert into auth.sessions values ('ffffffff-ffff-4fff-8fff-ffffffffffff','22222222-2222-4222-8222-222222222222',null);
insert into sessions(id,counselor_id,created_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',now()-interval '3 months');
set local role service_role;
insert into correction_logs(session_id,field_name,extracted_value,corrected_value,correction_timestamp,expires_at)
 values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ncae.overall_percentile','80','90','2000-01-01','2100-01-01');
reset role;
do $$ begin
  assert (select session_created_at = s.created_at and c.expires_at = correction_log_expiry(s.created_at)
    and c.correction_timestamp > now()-interval '1 minute' from correction_logs c join sessions s on s.id=c.session_id);
  assert correction_log_expiry('2024-02-29 23:59:59.123Z') = '2025-02-28 23:59:59.123Z'::timestamptz;
  assert correction_log_expiry('2023-02-28 12:00Z') = '2024-02-28 12:00Z'::timestamptz;
  assert correction_log_expiry('2024-01-31 12:00Z') = '2025-01-31 12:00Z'::timestamptz;
  assert not has_table_privilege('anon','correction_logs','select');
  assert not has_table_privilege('authenticated','correction_logs','insert,update,delete');
  assert not has_column_privilege('authenticated','correction_logs','expires_at','select');
  assert not has_function_privilege('authenticated','public.purge_expired_correction_logs()','execute');
  assert not exists(select 1 from pg_constraint where conrelid='correction_logs'::regclass and contype='f');
  assert (select not prosecdef from pg_proc where oid='public.stamp_correction_log()'::regprocedure);
  begin
    insert into correction_logs(session_id,field_name,corrected_value)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','notes.concerns','CONFIDENTIAL');
    raise exception 'Forbidden field was accepted';
  exception when check_violation then null; end;
  begin
    insert into correction_logs(session_id,field_name,corrected_value)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ncae.overall_percentile','STUDENT NAME');
    raise exception 'Forbidden value was accepted';
  exception when check_violation then null; end;
end $$;
set local timezone='America/New_York';
do $$ begin
  assert correction_log_expiry('2024-03-01 00:30+08') = '2025-02-28 16:30Z'::timestamptz;
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"ffffffff-ffff-4fff-8fff-ffffffffffff","exp":4102444800}',true);
set local role authenticated;
do $$ begin assert (select count(field_name)=1 from correction_logs); end $$;
reset role;
-- Even a stale evaluator JWT cannot retain access after admin revocation.
update auth.users set raw_app_meta_data='{}',raw_user_meta_data='{"role":"accuracy_evaluator","evaluation_authorized":true}'
 where id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
do $$ begin assert (select count(field_name)=0 from correction_logs); end $$;
reset role;
update sessions set status='cancelled' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
delete from sessions where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$ begin assert (select count(*)=1 from correction_logs); end $$;
set local role service_role;
do $$ begin assert purge_expired_correction_logs()=0; end $$;
reset role;
-- Disposable clock fixture: deployed writes cannot edit either timestamp.
alter table correction_logs disable trigger correction_log_stamp;
update correction_logs set expires_at=now()-interval '1 second';
set local role service_role;
do $$ begin assert purge_expired_correction_logs()=1; assert purge_expired_correction_logs()=0; end $$;
reset role;
rollback;
\echo SW-08 PostgreSQL access, fields, UTC calendar and independent deletion checks passed

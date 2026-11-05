"""Disposable PostgreSQL only: real connections race the SW-02 RPCs.
Run with PGHOST/PGPORT/PGUSER/PGDATABASE set; psql must be on PATH.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import time
import uuid


def sql(statement, check=True):
    result = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement],
                            text=True, capture_output=True)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result


root = Path(__file__).resolve().parent.parent
sql("""
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create schema storage; create table storage.buckets(id text primary key, name text, public boolean,
 file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(bucket_id text);
""")
sql((root / "supabase/migrations/20260523000000_module2_sessions.sql").read_text())
sql("grant all on public.sessions to service_role")
sql((root / "supabase/migrations/20261105030355_sw02_versioned_contracts.sql").read_text())
owner = str(uuid.uuid4())
session = str(uuid.uuid4())
sql(f"insert into public.sessions(id,counselor_id) values ('{session}','{owner}')")


def race(statement):
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: sql(statement, check=False), range(2)))
    assert sorted(r.returncode == 0 for r in results) == [False, True], results
    assert any("Stale" in r.stderr or "already reviewed" in r.stderr for r in results), results


race(f"set role service_role; select public.save_profile_version('{session}','{owner}',0,'{{}}',true)")
race(f"set role service_role; select public.start_analysis_run('{session}','{owner}',1,null)")
run = sql(f"select current_run_id from public.sessions where id='{session}'").stdout.strip()
race(f"set role service_role; select public.publish_report_version('{session}','{owner}',1,'{run}',0)")
race(f"set role service_role; select public.review_report_version('{session}','{owner}',1,1,'approved')")
print("PASS: separate-connection profile/run/publication/review races: one winner each")

# Hold the parent across the deadline. The waiter must check wall time AFTER its
# lock is granted, rather than the timestamp at transaction start.
sql(f"select public.start_analysis_run('{session}','{owner}',1,'{run}')")
run = sql(f"select current_run_id from public.sessions where id='{session}'").stdout.strip()
lock = subprocess.Popen(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", f"""
begin; select id from public.sessions where id='{session}' for update;
update public.analysis_runs set analysis_started_at=statement_timestamp()-interval '299 seconds',
 deadline_at=statement_timestamp()+interval '1 second' where run_id='{run}';
select pg_sleep(2); commit;
"""], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
# Observe the lock through pg_stat_activity instead of assuming scheduling order.
for _ in range(100):
    active = sql("select count(*) from pg_stat_activity where pid <> pg_backend_pid() and wait_event='PgSleep'").stdout.strip()
    if active != "0":
        break
    time.sleep(0.01)
else:
    raise AssertionError("blocker did not acquire the parent lock")
result = sql(f"select public.publish_report_version('{session}','{owner}',1,'{run}',1)", check=False)
_, err = lock.communicate(timeout=10)
assert lock.returncode == 0, err
assert result.returncode != 0 and "deadline elapsed" in result.stderr, result
print("PASS: completion blocked on parent lock is rejected after the deadline")

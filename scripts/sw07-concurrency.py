"""SW-07 races on separate PostgreSQL connections in a disposable, empty database.
Run with PGHOST/PGPORT/PGUSER/PGDATABASE set. Never target an application database.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import subprocess
import uuid

ROOT = Path(__file__).resolve().parent.parent
OWNER = str(uuid.uuid4())
NOTES = dict(careerGoal="Undecided", interests="Mathematics", financial="", concerns="", impression="")


def sql(statement, check=True):
    result = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement],
                            text=True, capture_output=True, timeout=15)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result


def literal(value):
    return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"


def race(first, second):
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = [pool.submit(sql, statement, False) for statement in (first, second)]
        return [job.result() for job in jobs]


def session():
    sid = str(uuid.uuid4())
    sql(f"""insert into sessions(id,counselor_id) values ('{sid}','{OWNER}');
      insert into session_notes(session_id,counselor_id,career_goal,interests,financial,concerns,impression)
      values ('{sid}','{OWNER}','Undecided','Mathematics','','','');""")
    return sid


def approval(sid, version=0, revision=0, notes=NOTES):
    profile = dict(sessionId=sid, counselorNotes=notes, academicData={})
    return f"""set role service_role; select approve_reviewed_inputs('{sid}','{OWNER}',
      {version},{revision},'{{}}',{literal(profile)},'[]');"""


def edit(sid):
    return f"""set role service_role; select save_intake_notes('{sid}','{OWNER}',0,
      {literal(dict(NOTES, concerns="Reviewed change"))},null,false);"""


def run(sid):
    return sql(f"select current_run_id from sessions where id='{sid}'").stdout.strip()


def transition(sid, rid, action):
    result = literal(dict(sessionId=sid, recommendations=[])) if action == "analysis_ready" else "null"
    return f"""set role service_role; select transition_processing_run('{sid}','{OWNER}',
      '{rid}',1,'{action}',{result},null);"""


def assert_invalid(sid):
    result = sql(f"""select (s.current_run_id is null and s.approved_profile is null and
      not exists(select 1 from profile_versions p where p.session_id=s.id and
      p.profile_version=s.current_profile_version and p.approved_at is not null))
      from sessions s where s.id='{sid}'""").stdout.strip()
    assert result == "t", result
    assert sql(f"select count(*) from report_versions where session_id='{sid}' and status<>'out_of_date'").stdout.strip() == "0"


sql("""create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create schema storage; create table storage.buckets(id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]); create table storage.objects(bucket_id text);""")
for name in ["20260523000000_module2_sessions", "20260524000002_module5_session_progress",
             "20261104144015_sw03_academic_upload_validation", "20261105030355_sw02_versioned_contracts",
             "20261105081447_sw15_processing_budget", "20261106110326_sw06_extraction_drafts_cleanup",
             "20261106124126_sw07_reviewed_profile_approval"]:
    sql((ROOT / f"supabase/migrations/{name}.sql").read_text())
sql("grant select,insert,update,delete on all tables in schema public to service_role")

sid = session()
results = race(approval(sid), approval(sid))
assert sorted(r.returncode == 0 for r in results) == [False, True], results
assert any("Inputs changed" in r.stderr for r in results), results
assert sql(f"select count(*) from analysis_runs where session_id='{sid}'").stdout.strip() == "1"
print("PASS: duplicate approvals have one snapshot/run winner")

for _ in range(5):
    sid = session()
    results = race(approval(sid), edit(sid))
    assert results[1].returncode == 0, results[1].stderr
    assert results[0].returncode == 0 or "Inputs changed" in results[0].stderr, results[0].stderr
    assert_invalid(sid)
print("PASS: approval/edit races always require reconfirmation")

for stage in ["analysis_ready", "report_ready"]:
    for _ in range(5):
        sid = session()
        sql(approval(sid))
        rid = run(sid)
        sql(transition(sid, rid, "claim_analysis"))
        if stage == "report_ready":
            sql(transition(sid, rid, "analysis_ready"))
            sql(transition(sid, rid, "claim_report"))
        results = race(transition(sid, rid, stage), edit(sid))
        assert results[1].returncode == 0, results[1].stderr
        assert results[0].returncode == 0 or "Stale" in results[0].stderr, results[0].stderr
        assert_invalid(sid)
        assert "Stale" in sql(transition(sid, rid, stage), False).stderr
        sql(approval(sid, 2, 1, dict(NOTES, concerns="Reviewed change")))
        new_run = run(sid)
        assert new_run != rid
        assert "Stale" in sql(transition(sid, rid, stage), False).stderr
        assert run(sid) == new_run
    print(f"PASS: {stage}/edit races and late old completions cannot restore current outputs")

flags = sql("""select count(*) from pg_proc where proname in
  ('approve_reviewed_inputs','invalidate_reviewed_inputs') and prosecdef""").stdout.strip()
assert flags == "0"
print("PASS: new functions remain security invoker")

# SW-10 PSA quarterly CSV ingestion

Baseline: fetched `main` at `ee71c55196006330b090f50ba4e7d8b206f39afc` on
5 November 2026. SW-09 is merged as PR #46. Work is isolated on `sw-10` in
`/private/tmp/kumpas-sw-10`; the original SW-02 checkout is untouched. The
[team tracker](https://kumpas-team-tracker.jrvnryle.chatgpt.site/) already assigns
SW-10 to Moen, In progress; that claim is retained.

Read approved [SRS Module 1.1](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view),
[SDD Module 1.1](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view),
[STD I08/I09/I13](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view),
[RTM KMP-FR-008/012](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view),
and [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view)
before editing. The SRS requires at least ten occupation-sector records,
operator-curated official provenance, and no partial batch after failure.
The STD requires full validation before embeddings/writes, stable identities,
unchanged-vector reuse, and rollback without advancing success markers.

## Change

Validate quarterly period syntax, the existing nonblank occupation/sector/region
contract and positive finite employment values. Accept `YYYY-Qn` and the legacy
`YYYYQn` spelling already used in repository tests. No new occupation or region
enumeration is invented. Preserve exact decimals and legitimate text instead
of pandas float/NA inference. Reject duplicate headers, structurally malformed
rows, duplicate composite keys, and batches smaller than ten. Errors include
the acquisition batch and row/field where applicable. Validate all chunk
provenance before constructing the embedder. File/HTTP/parser errors return
failure and log it; success continues through SW-09's existing atomic RPC.

`--validate-only` uses the same batch validation without requiring service
credentials or writing anything. PR validation checks contracts and the
committed CSV. A separate disposable PostgreSQL 17/pgvector job invokes the
actual PSA pipeline and refresh transaction as `service_role`; only embedding,
Supabase HTTP transport, and failure-log delivery are mocked. It checks ten
retrievable Market Analytics records, provenance/timestamps, zero embeddings
on unchanged replay, changed/new/superseded records, and preservation of rows,
success logs and freshness after validation/provider/late transaction failures.
Failure-log calls are asserted separately. These are focused automated portions
of I08/I09/I13, not claims that the full STD cases passed.

Synthetic fixtures live only under `ingestion/fixtures/psa/`. Workflow production
inputs remain under `ingestion/data/psa/`; no student/session data is added.

## Verification

- `/private/tmp/sw10-venv/bin/pip install -e './ingestion[psa]' psycopg2-binary pyyaml`:
  passed with network access after the sandbox blocked DNS. Python 3.12;
  pandas 2.3.3, Pydantic 2.14.2, Supabase 2.34.0.
- Before implementation, `/private/tmp/sw10-venv/bin/python -m unittest discover
  -s ingestion/tests -p test_psa.py -v` reproduced eight failing assertions and
  three errors across the new cases: minimum count, malformed structure,
  quarter validation, decimal/NA handling, early provenance validation, HTTP
  failure handling, and missing validation-only CLI.
- `/private/tmp/sw10-venv/bin/python -m unittest discover -s ingestion/tests -v`:
  33 passed; three database tests skipped locally because PostgreSQL/Docker and
  `PSA_TEST_DATABASE_URL` are unavailable. Existing SW-09 tests pass.
- `PSA_OPENSTAT_URL=file:///private/tmp/kumpas-sw-10/ingestion/data/psa/sample_lfs.csv
  PSA_SOURCE_URL=https://openstat.psa.gov.ph/ /private/tmp/sw10-venv/bin/python
  -m kumpas_ingestion.pipelines.psa --validate-only`: passed; 13 records, no writes.
- PyYAML `BaseLoader` parsed the workflow; assertions checked PR triggering,
  both prerequisite jobs, and main-only production ingestion.
- `/private/tmp/sw10-actionlint/actionlint .github/workflows/ingest-psa.yml`:
  passed with actionlint 1.7.12 from its official release.
- `/private/tmp/sw10-venv/bin/python -m compileall -q
  ingestion/src/kumpas_ingestion/pipelines/psa.py ingestion/tests/test_psa.py
  ingestion/tests/test_psa_database.py`: passed.
- `git diff --check`: passed.

CI results will be recorded after publication. The workflow runs
`psql -v ON_ERROR_STOP=1 -f supabase/tests/sw09_bootstrap.sql` followed by
`python -m unittest discover -s ingestion/tests -p test_psa_database.py -v`
with a new disposable database. Never use this bootstrap/test reset against a
deployed database.

## Configuration and deployment effects

No new migration, production secret, application deployment, query contract,
or submission PDF change. SW-09's migration must already be applied. Keep
`PSA_SOURCE_URL` set to the exact official HTTPS table and retain a known
`PSA_PUBLICATION_DATE`; unavailable publication dates remain null. Invalid or
undersized imports now fail instead of replacing valid PSA records. Successful
replacement can remove superseded PSA rows as already designed by SW-09.
Unchanged embeddings avoid provider charges. Production imports are serialized,
require successful validation/database jobs, and run only on main.

The committed sample's source accuracy is not established by schema validation;
its existing README warns about illustrative values. An operator must verify
the quarterly source, official URL and available release date before a live
import. No hosted Supabase/Gemini import, UI freshness/browser check, administrator
alert delivery, or full live STD run was performed. Local database execution is
unavailable; CI supplies real pgvector execution. Supabase API docs and the
current changelog were checked; the CLI v3 change is unrelated to this Python
client path. No database API/schema changes are introduced here.

Move to review with actual CI evidence and the PR URL. Done still requires
human review, passing required checks and merge into main.

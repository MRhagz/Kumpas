# SW-12: operator-curated DOLE PDF ingestion

## Baseline and requirements

Fetched and rechecked main `4ad85c0`, which includes merged prerequisite SW-09
(PR #46) and SW-10. Work is isolated on `sw-12`; the existing Jacob claim in the
[team tracker](https://kumpas-team-tracker.jrvnryle.chatgpt.site/) was retained.
Other checkouts and other people's branches were not overwritten.

Read the current approved documents before editing:

- [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view): Module 1.2 DOLE quarterly browser review, committed PDFs/optional sidecars, fallback identity and failure flows.
- [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view): OperatorCuratedDolePushTrigger, PDF processing, provenance and transactional refresh.
- [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view): I08, I09, I12 and I13, including missing metadata and source-preserving failures.
- [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view): KMP-FR-010/012.
- [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view): traceable source evidence and dates.

## Behavior and deployment

DOLE remains a quarterly **operator-reviewed, repository-triggered** path. It reads
committed local PDFs, never fetches sidecar URLs, and ingests only into Live Labor
Demand with `operator_curated_pdf`. The operator must verify the official public
source; URL syntax validation does not certify a publication's authenticity.

Supplied source/release URLs must be HTTPS without credentials. Metadata fields
must be text or unavailable; publication dates must be actual `YYYY-MM-DD` calendar
dates. Invalid JSON/encoding, wrong types, numeric dates, timestamps and invalid dates
fail that publication before extraction. Validation diagnostics omit raw input values.
Official references, title/release metadata, publication date and the server-assigned
ingestion timestamp are retained.

The approved optional-metadata fallback is preserved. Missing official URLs/dates
stay unavailable, with identity `operator_curated_pdf://dole_ble/<relative-file-path>`.
Top-level fallback identities are unchanged. Nested PDFs and uppercase `.PDF` are
included consistently with the watched directory, and relative paths disambiguate
equal basenames. Proper local file URIs decode spaces, percent signs and hashes on
Windows/Linux; local read errors become typed publication failures.

Failed publications receive individual failure logs and are excluded from refresh.
All-publication and fatal embedding/database failures preserve previously valid data.
Ambiguous duplicate source identities fail before embedding rather than choosing a
last writer. SW-09's atomic refresh, vector reuse, metadata-only corrections and
superseded-chunk cleanup remain unchanged. Absent/failed sources are retained;
unchanged reruns do not duplicate rows or advance freshness. HTTP and embedding
resources are closed on failure.

No new migration, production package, environment variable or secret. The existing
SW-09 migration must already be applied. Existing repository secrets remain
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY`; `DOLE_BLE_DIR` and
manual directory overrides remain supported. Commit PDF and adjacent `<stem>.meta.json`
together. A sidecar-only correction also triggers import. Run during the approved
ingestion window outside active counseling sessions. There is no DOLE cron/scraper.

The production workflow gates imports on reusable secret-free fixture/OCR and
disposable PostgreSQL/pgvector checks, and permits the ingestion job only on main.
PR tests cannot access production secrets. `DOLE_TEST_DATABASE_URL` is test-only and
must never reference a deployed database: integration tests reset fixture tables.
Only the existing DOLE drop-directory setup guide was updated.

## Verification commands and observed outcomes

Local tests use an isolated Python 3.12.16 environment outside the repository:

```powershell
uv pip install --python ../.tmp/sw12-tools/venv/Scripts/python.exe -e './ingestion[psa,pdf,fixtures,dev]' psycopg2-binary
$env:TEMP=(Resolve-Path '../.tmp/sw12-tools/tmp').Path
$env:TMP=$env:TEMP
```

| Exact command | Local outcome |
| --- | --- |
| `../.tmp/sw12-tools/venv/Scripts/python.exe -m unittest discover -s ingestion/tests/dole -v` | 16 run: 9 passed; one real-OCR and six real-database checks skipped because system binaries/PostgreSQL are unavailable locally. CI requires both. |
| `../.tmp/sw12-tools/venv/Scripts/python.exe -m unittest discover -s ingestion/tests -v` | 36 run: five existing PSA Windows file-URI failures and three database skips. Untouched main reproduces the same five failures. Updated DOLE orchestration contracts pass. |
| `../.tmp/sw12-tools/venv/Scripts/python.exe -m compileall -q ingestion/src ingestion/tests/dole` | Passed. |
| `../.tmp/sw12-tools/venv/Scripts/ruff.exe check --config ingestion/pyproject.toml ingestion/src/kumpas_ingestion/pipelines/dole_ble.py ingestion/src/kumpas_ingestion/pdf_downloader.py ingestion/tests/dole` | Passed. |
| `../.tmp/sw11-tools/actionlint/actionlint.exe .github/workflows/ingest-dole-ble.yml .github/workflows/sw12-contracts.yml` | Passed with actionlint 1.7.12. |
| `git diff --check` | Passed before publication. |

Baseline comparison uses an untouched archive of the same `4ad85c0` main revision
under `../.tmp/sw11-tools/baseline`. Set `PYTHONPATH` to its `ingestion/src`, then run
the SW-12 Python executable with `-m unittest discover -s ../.tmp/sw11-tools/baseline/ingestion/tests -v`:
the same five failures and three skips reproduce. PSA's `/C:/.../Software%20Engineering/...`
file URI is not a valid Windows path. PSA code is unchanged. Logs are outside the
repository in `outputs/SW-12-evidence`.

Mandatory CI commands (Ubuntu/Python 3.12), without production credentials:

```sh
pip install -e './ingestion[pdf,fixtures,dev]'
SW12_REQUIRE_OCR=1 python -m unittest discover -s ingestion/tests/dole -p test_dole_curated.py -v
pip install -e './ingestion[pdf,fixtures]' 'psycopg2-binary==2.9.13'
psql -v ON_ERROR_STOP=1 -f supabase/tests/sw09_bootstrap.sql
python -m unittest discover -s ingestion/tests/dole -p test_dole_database.py -v
```

The bootstrap is only for a fresh disposable database. The six database tests run
the actual production importer, repository and refresh RPC as `service_role`; only
the Supabase HTTP boundary, provider embeddings and failure logger are mocked.
They assert real stored provenance/dates/retrieval, unchanged replay, metadata-only
corrections without re-embedding, source-isolated shrink, mixed failures, provider
failure, late-write rollback, corrected retry, duplicates, and empty/all-invalid input.
The ten curated fixtures cover real local PDF reading, nested fallback identity,
metadata errors, no HTTP scraping, text/scan extraction and isolated OCR failure.
CI outcomes are recorded in the PR and tracker after the jobs complete.

No hosted import, live Gemini call, real quarterly operator review or full cross-source
STD acceptance is claimed. No application scope/deferred features or submission PDFs
were changed. Leave the task in review until human review, passing required checks
and merge into main; CI alone does not mark it done.

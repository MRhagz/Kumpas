# SW-11: CHED discovery and PDF ingestion

## Baseline and source alignment

Started from freshly fetched main `ee71c55`, which includes merged prerequisite
SW-09 / PR #46. The existing Jacob claim in the
[team tracker](https://kumpas-team-tracker.jrvnryle.chatgpt.site/) was retained.
The task branch is `sw-11`. No other checkout or person's branch was overwritten.
Before publication, rebased cleanly onto `4ad85c0`, which includes the subsequently
merged SW-10 work, and reran the ingestion checks on that updated base.

Approved documents read before editing:

- [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view): Module 1.2, acquisition, no-op and failure flows; public-source boundaries.
- [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view): Module 1.2, publication checker/cache, PDF downloader/extractor, cleaning, provenance and transactional refresh.
- [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view): I08, I09, I12 and I13.
- [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view): KMP-FR-009/012 and their acceptance checks.
- [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view): source/evidence traceability.

## Result and deployment effects

- Discovery resolves relative links against the final index URL, keeps query strings,
  removes fragment-only duplicates, selects the target year and retains CMO number,
  year, title and official reference. Index HTTP errors/missing listing markup fail
  visibly rather than being reported as a successful empty check.
- Automated discovery/downloads accept only public HTTPS links on `legacy.ched.gov.ph`,
  `ched.gov.ph` and `www.ched.gov.ph`, including redirects. Off-site, credential-bearing,
  local-file and nonstandard-port links are not fetched. Other pipelines retain the
  downloader's existing local-file/unrestricted-host mode.
- The first-run cap remains 10, configurable through `CHED_FIRST_RUN_LIMIT`. A valid
  empty or unchanged listing logs a no-op without downloading or advancing freshness.
  `CHED_TARGET_YEAR` still overrides the default current UTC year.
- Multi-page extraction uses the documented average threshold (default 50 characters
  per page) without counting synthetic form-feed separators. Required-but-disabled,
  missing, failed or insufficient OCR and lost pages are typed extraction failures.
  OCR temporary-file failures also remain publication-level failures. This shared
  extractor correction applies to DOLE PDFs as well; rich-text extraction is preserved.
- Individual failed publications receive failure logs and are excluded from refresh.
  All-publication failure, cache-read failure, embedding failure or write failure
  returns failure and preserves existing valid sources. HTTP resources close on failure.
- SW-09's transaction remains unchanged: successful chunks, success log, freshness and
  publication cache commit together. Cache row existence certifies successful ingestion;
  it is not written ahead of the transaction. Missing publication dates stay unavailable.
  Failed/uncached URLs remain eligible for retry, while incompatible legacy vectors
  retain SW-09's reprocessing behavior.
- No new migration, runtime environment variable, provider secret or production
  dependency. Deploy ingestion changes after the existing SW-09 migration is applied.
  The weekly schedule remains Monday 02:00 UTC; operators must verify the approved
  maintenance window is outside active counseling sessions before enabling ingestion.
- The CHED workflow tests fixtures and a disposable PostgreSQL/pgvector cache contract
  before scheduled/manual ingestion. PR runs have no production secrets and cannot
  enter the ingestion job; manual production ingestion is restricted to main.
  Fixture tests explicitly require real OCR in CI, including Tesseract/eng and Ghostscript.

## Commands and observed results

Local environment: Windows, isolated Python 3.12.16; dependencies installed with
`uv pip install --python ../.tmp/sw11-tools/venv/Scripts/python.exe -e './ingestion[psa,pdf,fixtures,dev]'`.
The portable runtime and dependency cache are outside the repository. For local
temporary files, set `$env:TEMP=(Resolve-Path '../.tmp/sw11-tools/tmp').Path` and
`$env:TMP=$env:TEMP`. An initial baseline test without this override failed on the
sandbox's temporary-directory permissions; the workspace temporary directory resolved it.

| Command | Observed outcome |
| --- | --- |
| `git fetch origin main` | Passed; confirmed current main and merged SW-09. |
| `../.tmp/sw11-tools/venv/Scripts/python.exe -m unittest discover -s ingestion/tests -v` | Initially 23 existing ingestion contracts passed. After the SW-10 rebase: 36 run, five PSA Windows file-URI failures and three disposable-database skips. The same five failures reproduce on untouched main; no PSA code is changed here. |
| `../.tmp/sw11-tools/venv/Scripts/python.exe -m unittest discover -s ingestion/tests/ched -v` | 20 run: 19 passed, real OCR skipped locally because Tesseract/Ghostscript are unavailable. Real OCR is mandatory in CI. |
| `../.tmp/sw11-tools/venv/Scripts/python.exe -m compileall -q ingestion/src ingestion/tests/ched` | Passed. |
| `../.tmp/sw11-tools/venv/Scripts/ruff.exe check --config ingestion/pyproject.toml ingestion/src/kumpas_ingestion/pipelines/ched_cmo.py ingestion/src/kumpas_ingestion/publication_index_checker.py ingestion/src/kumpas_ingestion/pdf_downloader.py ingestion/src/kumpas_ingestion/pdf_text_extractor.py ingestion/tests/ched` | Passed. |
| `../.tmp/sw11-tools/actionlint/actionlint.exe .github/workflows/ingest-ched.yml` | Passed with actionlint 1.7.12. |
| `git diff --check` | Passed. |

Read-only live discovery used the actual `PublicationIndexChecker.list_year(2026)`
against the official legacy index: HTTP 200, two CMOs (numbers 2 and 1), both on
`legacy.ched.gov.ph`. No embedding or hosted database call was made.

Baseline comparison archived `origin/main` with
`git archive -o ../.tmp/sw11-tools/baseline.tar origin/main ingestion src/lib/module3/embedding-contract.ts`
and extracted it under `../.tmp/sw11-tools/baseline`. With `PYTHONPATH` set to its
`ingestion/src` directory, running the same Python executable with
`-m unittest discover -s ../.tmp/sw11-tools/baseline/ingestion/tests -v` produces
the same five PSA failures and three database skips. The failing acquisition path
is `/C:/.../Software%20Engineering/.../valid_lfs.csv`, which is not a valid Windows
filesystem path. Logs are kept outside the repository in `outputs/SW-11-evidence`.

Repeatable CI commands (Ubuntu/Python 3.12):

```sh
pip install -e './ingestion[pdf,fixtures,dev]'
SW11_REQUIRE_OCR=1 python -m unittest discover -s ingestion/tests/ched -v
psql -v ON_ERROR_STOP=1 -f supabase/tests/sw09_bootstrap.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/sw11_ched_cache.sql
```

The SQL bootstrap is **only for a new disposable database**. Tests run the real
refresh RPC as `service_role`: initial CHED cache/provenance, an induced final-stage
cache-write failure rolling back previous chunks/logs/freshness, corrected retry,
superseded-chunk removal and unchanged replay without duplicate rows or false freshness.
All SQL fixtures roll back. The orchestration fixtures mock embedding/database calls;
the database job independently checks transaction behavior with real pgvector.

## Limits and review gate

No hosted ingestion, live Gemini embedding, school-session scheduling check, full
cross-source STD acceptance or application build is claimed by these local fixtures.
Local PostgreSQL/pgvector and OCR system binaries were unavailable; the dedicated CI
jobs provide those checks. No application feature, deferred RTM item or submission PDF
was added or updated. The task remains in review until human review, required checks
and merge into main; CI success alone does not mark it done.

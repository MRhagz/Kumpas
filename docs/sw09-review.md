# SW-09: Align ingestion and query embedding contracts

Query requests omitted `RETRIEVAL_QUERY`, stored vectors had no model fingerprint,
refreshes retained superseded chunks, and no-op checks advanced freshness. This change
makes the embedding contract explicit and commits each validated replacement batch
atomically while reusing unchanged vectors.

## Baseline and ownership

Approved documents read before implementation:

- [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view): Modules 1.1–1.3 and public-source provenance.
- [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view): TextChunker, EmbeddingService, VectorStoreRepository, knowledge-record contract and QueryEmbeddingService.
- [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view): I08, I09, I13 and I14.
- [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view): KMP-FR-012/013, stable composite identity and embedding checks.
- [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view): traceable supporting sources and source dates.

On 5 November 2026 (Asia/Manila), `git fetch origin main` succeeded and confirmed
`main` is still `8eae99156d68a190ae78dc494fb68abd52b73c2a`. There are no prerequisites.
The initial workspace was clean. Its `.git` remains read-only, so the task branch
`sw-09` is in `/tmp/kumpas-sw09`; the patch is also preserved in the original workspace.
The [team tracker](https://kumpas-team-tracker.jrvnryle.chatgpt.site/) already has
SW-09 claimed by James, matching the signed-in GitHub identity James Ewican. That
claim is retained. Earlier DNS/dependency/socket restrictions were resolved after
network access was enabled; the current results below supersede those blocked checks.

## Behavior and deployment effects

Both runtimes enforce `gemini-embedding-001` / 768 dimensions, with
`RETRIEVAL_DOCUMENT` for ingestion and `RETRIEVAL_QUERY` for queries. The retrieval
RPC checks query and stored fingerprints and rejects incompatible/unverified vectors.
The stable key remains `(silo_id, source_url, chunk_index)`; SHA-256 detects content
changes before provider calls. Official URLs and available publication dates are
explicit nullable fields. Missing dates remain unavailable. PSA acquisition paths no
longer become source identities. Source type, silo and acquisition method are validated.

The nonempty committed PSA/TESDA CSV is the current snapshot for its source group.
Removed records are deleted only when that validated replacement succeeds; empty
input never erases a group. PDF refreshes replace only successfully processed source
URLs, preserving failed/absent publications. Provider calls and vector validation
finish before a single database transaction that upserts replacements, removes
superseded chunks, and writes success/no-op logs, freshness and CHED cache entries.
A late write failure rolls back all of them. Concurrent content changes invalidate
the snapshot and require a rerun. Unchanged records retain vectors and ingestion
timestamps; true no-op checks do not advance ingestion freshness.

Apply `supabase/migrations/20261104000000_sw09_embedding_contract.sql` before updated
pipelines run, and deploy the query and ingestion changes together during an ingestion
maintenance window. The migration adds provenance/fingerprint columns and replaces
the retrieval RPC. RLS is enabled on `knowledge_chunks`; both invoker RPCs are
restricted to `service_role`. Existing vectors are retained with unknown fingerprints
rather than being labeled compatible. Retrieval rejects a silo until its legacy
sources are replayed. Replay historical CHED years with `CHED_TARGET_YEAR`; compatible
cached publications remain skipped. Re-embedding legacy records incurs provider calls.

For file-based PSA ingestion, set repository variable `PSA_SOURCE_URL` to the official
HTTPS reference, independently of `PSA_OPENSTAT_URL`. `PSA_PUBLICATION_DATE` is optional
(`YYYY-MM-DD`). TESDA may include optional `official_source_url` and `publication_date`
columns; textual source references remain supported. DOLE sidecars retain supplied
source/publication metadata. Confirm no unverified vectors remain before reopening
analysis; investigate unavailable historical sources with the team rather than
inventing their provenance. See the [ingestion guide](../ingestion/README.md).

## Verification on 5 November 2026

| Exact command | Outcome |
| --- | --- |
| `git fetch origin main` (in `/tmp/kumpas-sw09`) | Passed; remote main remains the audit commit above. |
| `npm ci --cache /tmp/sw09-npm-cache --ignore-scripts` | Passed; installed locked dependencies. |
| `PIP_CACHE_DIR=/tmp/sw09-pip-cache /tmp/sw09-real-venv/bin/pip install -e './ingestion[psa]'` | Passed in a fresh Python 3.12.12 virtualenv; Pydantic 2.14.2, httpx 0.28.1, Supabase 2.34.0, pandas 2.3.3. |
| `/tmp/sw09-real-venv/bin/python -m unittest discover -s ingestion/tests -v` | 23 passed. Provider/configuration/provenance validation, reuse/new/changed chunks, legacy vectors/cache, pagination, duplicate keys, invalid CSV, fatal errors and publication isolation. |
| `node scripts/sw09-contract.test.mjs` | 6 passed with installed TypeScript. Query model/dimensions/task type, invalid configuration/vectors, provider failure, fingerprinted silo queries and nullable provenance. |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | Passed full project typecheck. |
| `npm run lint -- src/lib/module3/embedding-contract.ts src/lib/module3/query-embedding-service.ts src/lib/module3/vector-store-query-service.ts src/lib/module3/types.ts scripts/sw09-contract.test.mjs` | Passed; no errors or warnings in these files. |
| `npm run lint` | Fails with 8 existing errors / 17 warnings. The main checkout has the same totals and identical normalized error locations/rules/messages. No baseline errors were suppressed or fixed in this PR. |
| `npm run build` without environment variables | Compiled and typechecked, then failed page-data collection because Supabase URL was not configured. |
| `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=sw09-build-placeholder SUPABASE_SERVICE_ROLE_KEY=sw09-build-placeholder npm run build` | Passed production build with placeholders; no live provider/database credentials used. Existing middleware deprecation warning remains. |
| `PGOPTIONS='-c extension_control_path=/tmp/sw09-pgvector:$system' PGHOST=/tmp/sw09-pgvector-db PGPORT=55440 PGDATABASE=sw09_real psql -v ON_ERROR_STOP=1 -f supabase/tests/sw09_bootstrap.sql` | Passed audited ingestion schema + original retrieval RPC + the SW-09 migration against PostgreSQL 18.6 / real pgvector 0.8.1. |
| `PGHOST=/tmp/sw09-pgvector-db PGPORT=55440 PGDATABASE=sw09_real psql -v ON_ERROR_STOP=1 -f supabase/tests/sw09_embedding_contract.sql` | Passed real vector reuse/deletion, unchanged timestamps, no-op freshness, late-write rollback, failed-source isolation, stale snapshots, RLS/privileges, correct retrieval/provenance, wrong dimensions/model, and unverified legacy vectors. Assertions run as `service_role`; fixtures roll back. |
| `git diff --check` | Passed. |

The isolated PostgreSQL setup uses an unmodified pgvector 0.8.1 source build:
`git clone --depth 1 --branch v0.8.1 https://github.com/pgvector/pgvector.git /tmp/sw09-pgvector`
and `make -C /tmp/sw09-pgvector -j2`. Its control/SQL files were placed under
`/tmp/sw09-pgvector/extension/`, with the control file pointing at the temporary
`vector.so`. `initdb -D /tmp/sw09-pgvector-db -A trust --encoding=UTF8 --no-locale`
created a disposable cluster. The foreground server command is
`postgres -D /tmp/sw09-pgvector-db -k /tmp/sw09-pgvector-db -h '' -p 55440 -c extension_control_path=/tmp/sw09-pgvector`.
No hosted database, repository secrets, application data or submission PDFs changed.
The earlier JSON-vector stand-in smoke is superseded by these real pgvector checks.

Baseline lint comparison used `git archive origin/main` in `/tmp/sw09-baseline`,
with the same installed dependencies, then `node node_modules/eslint/bin/eslint.js
--format json` in both directories. Normalizing repository paths makes all eight
error records identical. The new test runner uses ESM and passes scoped lint.
The pinned Next 16.2.6 server guide was read after installing dependencies.

## Limits and review gate

`.github/workflows/sw09-contracts.yml` runs the mocked suites, full typecheck, scoped
lint and real pgvector SQL contracts in a disposable PostgreSQL 17 container.
The SQL bootstrap is only for a new disposable database; it does not validate the
entire unrelated application migration history. CI results and the PR URL belong
in the tracker after publication.

Supabase CLI commands remain unavailable: `node_modules/.bin/supabase --help`
fails attempting to create `/home/kliesen/.supabase` on a read-only filesystem.
The migration was authored manually and verified through PostgreSQL rather than
CLI migration/advisor commands. Hosted Supabase migration history/advisors and
live Gemini/Supabase evaluation were not run. Full STD E1 fixture counts, query
minimization, UI freshness assertions and R03 retrieval evaluation were not executed;
this is focused contract coverage, not a full STD case pass.

No deferred RTM features or submission PDFs were added. Record actual CI results,
move to review, and leave done pending human review, required checks and merge into main.

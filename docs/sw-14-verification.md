# SW-14: specialist evidence silos

Baseline: refreshed `origin/main` at `dd61633` on 5 November 2026, including merged SW-01 (#42), SW-09 (#46), SW-10 (#50), and SW-02 (#49). Work is isolated in `/private/tmp/kumpas-sw14` on `sw-14`; the original checkout and its local changes are preserved.

## Approved sources

Read the linked current [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view) §3.1.2 and Module 3.1, [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view) QueryEmbeddingService / VectorStoreQueryService and specialists, [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view) I05 / I14, [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view) KMP-FR-013, and [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view). Requirements retain exactly three public silos, zero cross-silo bleed, minimized embedding queries, actual provenance, explicit missing evidence, and separate session storage. The installed Next 16.2.6 data-security guide, Supabase changelog and database-function guidance were also read.

## Behavior

- Academic Auditor retrieves PSA records from Market Analytics; Industry Analyst retrieves DOLE BLE records from Live Labor Demand; Feasibility Strategist retrieves CHED and TESDA records together from Path Feasibility.
- The service-only database RPC now requires a recognized specialist and validates the requested silo against a fixed mapping. Missing/null/unknown specialist identities, foreign/wildcard/null silos, and invalid limits fail closed. No caller filter can broaden the silo or allowed source types. The old unbound overload is removed.
- TypeScript independently checks returned silo, source type and embedding fingerprint, rejecting the whole batch before generation when any record is unauthorized. Frozen routing maps reject prototype-name lookups.
- All specialists consume the existing `ApprovedProfile` DTO supplied from the saved approved profile by the server route; they do not read alternative session notes or re-extract documents. This PR does not replace the versioned profile/run lifecycle, which belongs to its integrating consumers.
- Embedding queries use structured academic signals and a fixed source-specific query; raw counselor narratives and session references are excluded. No retrieval or specialist operation writes public knowledge. Existing operator ingestion remains the only writer.
- Prompts carry actual source URL, chunk index, source tag, acquisition method, ingestion time and nullable publication/official-source fields. Returned `retrievedChunks` retain the complete evidence records. Missing source categories are exposed in `unavailableEvidence` and forwarded to synthesis. An empty retrieval returns a failed specialist with an explicit unavailable-evidence analysis and no generation call. This does not change ranking/scoring policy.

## Migration and deployment

Apply `20261105070028_sw14_specialist_evidence_silos.sql` after SW-09 and coordinate the database/application rollout outside active counseling sessions. It replaces the six-argument RPC with a seven-argument RPC whose new `request_agent` defaults to null solely so old callers fail closed with a clear authorization error. Old application builds cannot retrieve after migration; new builds cannot retrieve before migration. Deploy the migration and server together in a maintenance window; roll back the application and RPC definition together if necessary. Ingestion refresh RPCs, rows and embeddings are unchanged. There are no new secrets, environment variables, dependencies, tables or grants to browser roles. RLS and service-role-only SECURITY INVOKER execution remain in place.

Existing incorrectly tagged or unverified records cause retrieval to fail for their assigned silo until operators repair/refresh them through the approved public acquisition pipeline; this migration never silently relabels records. Hosted migrations and ingestion were not run. Supabase CLI `--help` was killed by SIGKILL both inside and outside the sandbox, so the timestamped migration was authored manually; local migration-list/advisors were unavailable. PostgreSQL/Docker are not installed locally. No submission PDFs or live student records were changed.

## Verification

Commands run from the isolated checkout unless stated otherwise:

| Command | Outcome |
| --- | --- |
| `./node_modules/.bin/vitest run --config vitest.config.ts` | PASS: 205 tests, including 14 new specialist tests. Provider/database HTTP boundaries are mocked for these tests. |
| `./node_modules/.bin/vitest run --config vitest.config.mts` | PASS: 28 notes tests. |
| `node scripts/sw09-contract.test.mjs` | PASS: 6 embedding/query contract tests. |
| `./node_modules/.bin/tsc --noEmit --pretty false` | PASS. |
| `./node_modules/.bin/eslint src/lib/module3/vector-store-query-service.ts src/lib/module3/types.ts src/lib/module3/specialist-evidence.ts src/lib/module3/academic-auditor-agent.ts src/lib/module3/industry-analyst-agent.ts src/lib/module3/feasibility-strategist-agent.ts src/lib/module3/synthesis-interpreter.ts tests/specialist-silos.test.ts scripts/sw09-contract.test.mjs` | PASS. |
| `PYTHONPATH=ingestion/src /private/tmp/sw10-venv/bin/python -m unittest discover -s ingestion/tests -v` | PASS: 33 passed; 3 database tests skipped pending a disposable pgvector database. Initial system-Python invocation failed to import uninstalled dependencies; the existing isolated ingestion environment resolved them. |
| `git diff --check` | PASS. |

The new SQL test uses identical embeddings for distinguishable PSA, DOLE, CHED and TESDA sentinel records so similarity cannot accidentally isolate the fixtures. It requires all four records to be retrieved across their assigned specialists with zero foreign records, rejects every foreign agent/silo combination and mismatched source tag, verifies nullable provenance and privileges, checks an empty silo never falls back to another silo, and verifies retrieval does not mutate public knowledge. It runs with `service_role` and rolls back its fixtures. CI executes actual PostgreSQL 17/pgvector:

```
psql -v ON_ERROR_STOP=1 -f supabase/tests/sw09_bootstrap.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/sw09_embedding_contract.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/sw14_specialist_silos.sql
```

The existing PSA database caller was updated for required specialist identity. [PR #55](https://github.com/MRhagz/Kumpas/pull/55), implementation commit `d544cc7`: all seven GitHub Actions jobs and the Vercel preview passed. The [real database job](https://github.com/MRhagz/Kumpas/actions/runs/41985372764/job/127104757067) executed all three SQL commands above and reported `I05 PASS: 4/4 sentinel records; cross-silo bleed 0/4; unauthorized requests rejected`. The [access job](https://github.com/MRhagz/Kumpas/actions/runs/41985372729/job/127104756492) passed the production build, browser-secret check and actual HTTP denial/login smoke. The [PSA job](https://github.com/MRhagz/Kumpas/actions/runs/41985372782/job/127104756905) passed its three real database tests using the updated specialist identity. Production ingestion was correctly skipped on the PR.

The initial local build command `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=sw14-public-test-key SUPABASE_SERVICE_ROLE_KEY=sw14-server-test-only npm run build` failed because Turbopack disallows a `node_modules` symlink outside the checkout root. An isolated dependency install was started to resolve that checkout limitation; its sandbox attempt failed with registry DNS errors and was retried with network access. The CI build used its own clean installation and passed. No repository configuration was changed to work around the local symlink.

The tracker could not yet be located: repository issues are empty, GitHub Projects access lacks `read:project`, connected Drive searches did not locate it, and browser access is unavailable. Its URL was requested; no task assignment or progress belonging to another person was overwritten. Tracker claim/review updates remain pending that URL. No full live STD E1 execution, hosted Supabase/Gemini retrieval, counselor browser evaluation, or production deployment is claimed. Human review, required passing checks and merge remain necessary before done.

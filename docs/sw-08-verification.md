# SW-08: restricted academic correction logs

Implemented from fetched `main@ec39b3e1e34bfbf540be54e2546f46fe3df981ff` on 6 November 2026, branch `sw-08`, isolated clone `/tmp/kumpas-sw-08`. The original checkout's `.git` is read-only and remains untouched. Re-fetch before publication confirmed the same main. The live [team tracker](https://kumpas-team-tracker.jrvnryle.chatgpt.site/) already assigned SW-08 to James; that claim was retained and recorded. SW-02 [#49](https://github.com/MRhagz/Kumpas/pull/49) and SW-07 [#63](https://github.com/MRhagz/Kumpas/pull/63) are merged and recorded done; no prerequisite waivers.

Read the approved linked [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view) Modules 2.2/5.2 and Data Retention, [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view) Section 2.4 and CorrectionLogArchiver, [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view) F07/S06, [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view) KMP-FR-007/NFR-004, and [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view). Current main already contains SW-07's atomic approval/audit transaction and SW-01's denial of counselor correction reads. The earlier `8eae991` source audit predates those changes.

## Behavior

Approval retains SW-07's transaction and exact reviewed profile. A separate audit projection writes only changed academic keys and old/new values with a pseudonymous session UUID. Numeric subject/strand keys use ordinals instead of unrestricted labels or document IDs; identities are matched in memory before assigning ordinals, so dictionary reordering does not create corrections and removed scores are recorded as cleared. Values are numeric scores, formatted school years, or bounded academic strand/mastery categories. Unrestricted text categories are omitted from the audit when either value is outside the allowlist; the reviewed profile itself is preserved. Names, filenames, notes, raw model output and free-text subject labels never become audit fields or values. Ordinals intentionally do not preserve a subject-label crosswalk after temporary input deletion.

Database constraints independently enforce this format. Existing entries outside it are deleted during migration, including historic free-text/label-bearing keys whose safe provenance cannot be established. There is no copy to another store. Other valid entries keep their correction time. Before applying, operators should review aggregate affected-row counts in their approved restricted environment; do not export disallowed row content for this review.

Evaluator reads expose exactly `session_id,field_name,extracted_value,corrected_value,correction_timestamp`. `select *` is deliberately denied. Evaluators have no correction mutation/cleanup grant. The RLS guard uses live administrator-controlled Auth metadata and a live, unexpired Auth session, rejects anonymous/deleted/banned/unconfirmed accounts and expired JWTs, and ignores user-editable metadata. A restrictive policy prevents an older permissive read policy from widening access. Counselors/anonymous clients remain denied. Infrastructure administrators and the existing server service role retain privileged operational access; this PR does not claim SW-27's wider operational credential separation.

`session_created_at` and `expires_at` are restricted retention metadata. Inserts stamp both from the original session under a row lock, overwrite caller-supplied correction time/expiry, and reject missing or already expired parent sessions. Audit updates are prohibited, including service-role updates. UTC timestamp arithmetic adds 12 calendar months, with PostgreSQL's month-end fallback (29 February becomes 28 February in a non-leap year). RLS denies reads at the expiry instant. The session foreign key is removed; termination and independent session deletion preserve the immutable audit and its original clock. The existing termination handler continues to omit correction logs.

Correction logs are not read by runtime provider code. A regression injects audit sentinels into the input and checks the actual specialist Gemini request, in addition to the existing allowlisted provider projection. No public knowledge-table flow is added.

## Migration and operation

Apply `supabase/migrations/20261106132602_sw08_restricted_correction_logs.sql` after the existing SW-01/02/07 prerequisites and before deploying this application version. It adds retention metadata/index, backfills from sessions, deletes expired/invalid legacy entries, drops only the correction session FK, adds format/append-only enforcement, evaluator RLS and a service-only invoker purge RPC. Existing baseline table names and the SW-07 approval signature are preserved. New privileged code is confined to the private, fixed-search-path, caller-scoped Auth lookup needed by RLS; mutation/purge/expiry functions are invokers.

Provision evaluation personnel through an approved administrator's Supabase Auth workflow: confirmed account, `app_metadata.role = "accuracy_evaluator"` and `app_metadata.evaluation_authorized = true`. Never put these flags in `user_metadata`. No existing account is promoted by the migration. Use the account's authenticated session and explicitly request the five columns above. Revoke the flag/role or Auth session to remove access immediately, even with an old token. Evaluator accounts do not satisfy counselor app authorization.

`.github/workflows/sw08-correction-logs.yml` runs tests on PRs and cleanup hourly at minute 17, or by manual workflow dispatch, on `main` only. It uses the existing repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; verify these point to the intended deployment before enabling the schedule. The cleanup step calls `node scripts/purge-correction-logs.mjs`. Manual fallback: run that command from the approved deployment environment with those two variables. It invokes `purge_expired_correction_logs()`, logs only a deleted count or a generic failure, and exits unsuccessfully on failure. Repeat safely after an outage. GitHub scheduling may be delayed; logical access ends at exact expiry while physical deletion waits for a successful run. Operations must monitor failed/missed jobs and execute the fallback. No configurable retention override exists.

After a backup restore, keep evaluator access closed, reapply the migration/security controls as appropriate, and run the purge before reopening access. Original stored timestamps must survive restore. Hosted database encryption/backups, production evaluator provisioning, actual scheduler execution and monitoring ownership require deployment verification; they were not changed or claimed here.

Grade 10/SHS counselor operation and already-approved extraction behavior are preserved. SW-05 permits paid Gemini extraction without local masking; no local-redaction work or billing/provider-retention claim is introduced. SRS/SDD/STD/RTM privacy/extraction reconciliation remains a later document handoff. No baseline documents or submission PDFs were edited. Ingestion's 90-day logs and wider lifecycle/operations tasks remain outside this focused F07/S06 correction-log change.

## Verification

Commands ran in `/tmp/kumpas-sw-08`; suites overlap and counts are not additive.

| Command | Outcome |
| --- | --- |
| `git fetch origin main` in original workspace | Unavailable: read-only `.git/FETCH_HEAD`; used isolated clone. |
| `git clone --branch main --single-branch https://github.com/MRhagz/Kumpas.git /tmp/kumpas-sw-08`; `git switch -c sw-08`; later `git fetch origin main` | Passed. No existing remote `sw-08` or PR was overwritten. |
| `npm ci --cache /tmp/kumpas-sw08-npm-cache` | Passed, 843 packages; audit reports 32 existing dependency vulnerabilities. No dependency change bundled. Task-created npm cache removed after temporary quota pressure. |
| `node_modules/.bin/supabase migration new sw08_restricted_correction_logs` | Unavailable: CLI cannot create read-only `/home/kliesen/.supabase`; migration created manually after the attempted command. |
| `node_modules/.bin/vitest run --config vitest.config.ts` | Passed: 489 tests in 31 files. |
| `node_modules/.bin/vitest run --config vitest.config.ts tests/correction-logs.test.ts tests/reviewed-inputs.test.ts tests/processing-providers.test.ts tests/processing-termination.test.ts` | Passed after final migration/test changes: 45 tests in 4 files. |
| `npm test` | Passed: 28 notes tests. |
| `npm run test:upload` | Passed: 59 tests. |
| `node_modules/.bin/tsc --noEmit --pretty false` | Passed after correcting types in the new test fixture. |
| Scoped ESLint command below | Passed without warnings. |
| `npm run lint` | Baseline failure: 7 errors/12 warnings; error files are unchanged from fetched main (`src/app/page.tsx`, analysis `pdf-modal.tsx`/`report-view.tsx`, input `wysiwyg-field.tsx`). Verified with `git diff --exit-code origin/main -- ...`. |
| Synthetic configuration plus `npm run build` | Passed compilation, typecheck and route generation. |
| Production server plus `KUMPAS_BASE_URL=http://127.0.0.1:3118 node scripts/access-http-smoke.mjs` | Passed: 20 API denials, 2 page redirects, 1 login check. Initial server invocation lacked provider variables and exited; rerun with the full synthetic configuration below passed. |
| PostgreSQL commands below | Passed on disposable PostgreSQL 18.6: actual migration, grants/RLS, forbidden fields/values, UTC/leap-year/month-end, timestamp stamping, append-only grants, independent session deletion and idempotent cleanup. |
| `git diff --check` | Passed. |

Scoped lint:

```sh
node_modules/.bin/eslint src/lib/module2/correction-audit.ts src/lib/module2/student-profile-builder.ts src/lib/report/session-termination.ts scripts/purge-correction-logs.mjs tests/correction-logs.test.ts tests/reviewed-inputs.test.ts tests/processing-providers.test.ts tests/processing-termination.test.ts
```

Real PostgreSQL (empty task database only):

```sh
initdb -D /tmp/kumpas-sw08-pg -A trust --no-locale
pg_ctl -D /tmp/kumpas-sw08-pg -l /tmp/sw08-pg.log -o '-k /tmp -p 55409' start
createdb -h /tmp -p 55409 sw08
PGHOST=/tmp PGPORT=55409 PGDATABASE=sw08 psql -X -f supabase/tests/sw08_correction_logs.sql
pg_ctl -D /tmp/kumpas-sw08-pg stop
```

The first `psql` invocation in a later tool process found the process-scoped server stopped; restarting it and running the test in the same command passed. The test rolls its disposable fixture back. CI repeats it with PostgreSQL 17. Embedded PostgreSQL tests additionally substitute a test-only clock to check one millisecond before, exactly at and after expiry; no clock override exists in deployed SQL.

Build and HTTP smoke use synthetic variables, not live provider/Storage calls:

```sh
export NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=sw08-public-test-key SUPABASE_SERVICE_ROLE_KEY=SW08_SERVER_SECRET_SENTINEL DOCUMENT_INTAKE_API_KEY=SW08_SERVER_SECRET_SENTINEL ACADEMIC_AUDITOR_API_KEY=SW08_SERVER_SECRET_SENTINEL INDUSTRY_ANALYST_API_KEY=SW08_SERVER_SECRET_SENTINEL FEASIBILITY_STRATEGIST_API_KEY=SW08_SERVER_SECRET_SENTINEL SYNTHESIS_API_KEY=SW08_SERVER_SECRET_SENTINEL
npm run build
node_modules/.bin/next start --hostname 127.0.0.1 --port 3118
# In a second process while that server is running:
KUMPAS_BASE_URL=http://127.0.0.1:3118 node scripts/access-http-smoke.mjs
```

The browser build was scanned for the synthetic server secret and passed. Hosted migration/advisors, live Gemini, real evaluator accounts, production cleanup execution and independent human STD acceptance remain unrun. Leave the tracker in review after PR publication. Done requires human review, passing required checks and merge into main.

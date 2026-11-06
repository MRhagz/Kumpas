# SW-07: approve exact inputs and invalidate stale work

## Baseline and scope

Implemented on 6 November 2026 from fetched `main@06729d7d2847dc1f90f1cb55f7234d0355deffbb`, including SW-06 PR #61. The original workspace has a read-only `.git`; work is isolated in `/tmp/Kumpas-sw-07`, branch `sw-07`. Tracker revision 190 already assigned SW-07 to James in progress; that ownership was retained and recorded at revision 191. SW-02 (#49), SW-04 (#45) and SW-06 (#61) were recorded done and are merged. No prerequisite waivers are needed.

Read the linked approved [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view) Module 2.2 and Data Consistency Across Modules, [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view) StudentProfileBuilder/AgentDispatcher, [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view) F07 and I04, [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view) KMP-FR-006/NFR-007, and [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view). The 8eae991 source audit predates SW-06: current main already persists editable academic drafts. Remaining gaps were approval revision checks, atomic audit/approval persistence, provenance in the canonical snapshot, and editing/invalidation after approval.

Grade 10/SHS counselor operation, optional academics, required/optional note rules, provider deadlines, access controls and retention remain unchanged. SW-05's explicit decision permits configured paid Gemini extraction without local masking. This PR adds no redaction, deferred RTM capabilities, production billing claims or baseline-document/PDF edits. SRS/SDD/STD/RTM privacy/extraction reconciliation remains a later document handoff. SW-08 still owns correction-log evaluator access and retention; SW-21 still owns the full final-report review experience.

## Behavior and contracts

Approval requires the displayed `profileVersion`, `notesRevision` and complete set of document IDs/revisions, alongside the existing reviewed-notes confirmation. It rejects changed notes, changed/removed/replaced documents, incomplete processing and stale/duplicate approvals. The builder uses the saved reviewed values; Form 137 retains its full reviewed record, including empty subjects, cleared grades, GWA and school year. Unreadable/unsupported evidence is referenced without becoming invented academic data.

The service-only `approve_reviewed_inputs` transaction rechecks those revisions under the session lock, inserts the immutable profile and academic correction entries, and starts the timed run atomically. Failure rolls everything back. The profile includes `profileVersion`, `confirmedAt`, the same `sessionTimestamp`, academic values, reviewed notes and `inputEvidence` with document IDs/categories, draft revisions, evidence states, extraction provenance and photographed-note source references. Unknown legacy source details stay unknown. Academic correction entries are derived server-side; browser-supplied correction entries and qualitative notes are not written to that log.

Saved academic/note changes, removal and replacement claims invalidate an approved current profile under the same lock used by run completion/report publication. Invalidation supersedes old runs, marks reports out of date, removes their approval, clears current run/legacy profile pointers and resets progress. An unapproved marker reserves the next profile version once; subsequent draft edits remain unapproved. Reconfirmation saves a new immutable approved version, so approved version numbers can have gaps. Earlier snapshots remain immutable historical data until existing cleanup removes them. No counter or expiry is reset. Superseded PDFs remain private and cannot be released as current results; normal retention handles their objects.

Analysis requests now carry `{ runId, profileVersion }`, with `retryRunId` for an explicit retry. A recovery retry may carry a null run ID when the saved approved version has no current run. The existing SW-02/SW-15 functions reject late analysis, explanation, failure and PDF publication from superseded runs. A stale browser cannot start a different current run using an old token. The browser rechecks the current run before showing a returned report.

`Review or correct inputs` opens the owner session at `/input?session=...&edit=1` without the normal redirect back to analysis. Opening review does not invalidate unchanged inputs. Academic/notes edits remain visibly unsaved until Save draft; saving invalidates dependent work and requires review/approval again. Upload/removal also requires verifying the saved draft before approval. Lease cleanup takes the parent lock before child rows and does not invalidate unchanged data merely by releasing an expired lease.

## Migration and rollout

Apply `supabase/migrations/20261106124126_sw07_reviewed_profile_approval.sql` after the SW-02, SW-03, SW-15 and SW-06 migrations and before deploying this UI/API together. It replaces the intake guard/read/lease-release functions and adds invalidation triggers plus one service-only approval RPC. No new tables/columns, environment variables, storage buckets, browser grants or security-definer functions are introduced. Existing approved snapshots are not rewritten. Reconfirm legacy inputs to create the new provenance-bearing profile contract.

Old browser tabs/API callers that omit the new revision/run tokens must reload; invalid requests return 400 and stale requests 409. No hosted database changes, production deployment, real student processing or submission PDF changes were performed. The CLI migration command could not initialize its read-only `/home/kliesen/.supabase` state, so the migration file was created manually after that failed attempt. Local SQL validation below uses both embedded PostgreSQL and a fresh real PostgreSQL cluster.

## Verification

All commands ran in `/tmp/Kumpas-sw-07`. Suites overlap; their counts must not be added as unique coverage.

| Command | Outcome |
| --- | --- |
| `git fetch origin main` in the original checkout | Unavailable: `.git/FETCH_HEAD` is read-only. |
| `git clone https://github.com/MRhagz/Kumpas.git /tmp/Kumpas-sw-07`; `git switch -c sw-07`; `git ls-remote origin refs/heads/main refs/heads/sw-07` | Passed; isolated current main, no existing remote sw-07 branch. |
| `npm ci` | Initially failed: default npm cache is read-only. |
| `npm ci --cache /tmp/kumpas-sw07-npm-cache` | Passed, 843 packages. Audit reported 32 dependency vulnerabilities; no dependency changes bundled. |
| `node_modules/.bin/vitest run --config vitest.config.ts` | Passed: 420 tests, 27 files, including 13 reviewed-input integration tests and 3 analysis browser-component tests. |
| `npm test` | Passed: 28 notes tests. |
| `npm run test:upload` | Passed: 59 upload tests. |
| `node_modules/.bin/tsc --noEmit --pretty false` | Passed. |
| Scoped ESLint command below | Passed without warnings. |
| `npm run lint` | Fails with 7 existing errors and 12 warnings. Error files are unchanged from fetched main: `src/app/page.tsx`, `src/components/analysis/pdf-modal.tsx`, `report-view.tsx`, and `src/components/input/wysiwyg-field.tsx`; verified with `git diff --exit-code origin/main -- ...`. No suppressions or unrelated fixes added. |
| Production build with synthetic configuration below | Passed, including compilation, TypeScript and route generation. |
| Production server plus `node scripts/access-http-smoke.mjs` | Passed: 20 API denials, 2 protected-page redirects and 1 login check. |
| `PGHOST=/tmp PGPORT=55408 PGDATABASE=sw07 PGUSER=kliesen python3 scripts/sw07-concurrency.py` | Passed on PostgreSQL 18.6: duplicate approvals, five approval/edit races, five analysis-publication/edit races, five PDF-publication/edit races, reconfirmation and late-old-run rejection, security-invoker catalog checks. Uses separate `psql` connections as service_role. |
| `python3 -m py_compile scripts/sw07-concurrency.py`; `git diff --check` | Passed. |
| `node node_modules/supabase/dist/supabase.js migration new --help`; `node node_modules/supabase/dist/supabase.js migration new sw07_reviewed_profile_approval` | CLI initialization failed because its home-state directory is read-only. No hosted migration/advisor results claimed. |

The PostgreSQL race check ran in a disposable cluster created with `initdb -D /tmp/kumpas-sw07-pg-final --auth=trust --no-locale`, started by `pg_ctl -D /tmp/kumpas-sw07-pg-final -l /tmp/sw07-postgres-final.log -o '-k /tmp -p 55408 -h 127.0.0.1' start`, and initialized with `createdb -h /tmp -p 55408 sw07`. The cluster was stopped after the successful check. An earlier rerun failed because the shell-managed server had exited; reusing that cluster then encountered its already-created roles. The final run used a fresh cluster. CI runs the same script against a disposable PostgreSQL 17 service.

Scoped lint:

```sh
node_modules/.bin/eslint src/lib/module2/student-profile-builder.ts src/lib/module2/intake-draft-store.ts 'src/app/api/sessions/[sessionId]/approve/route.ts' 'src/app/api/sessions/[sessionId]/analyze/route.ts' src/components/input/input-container.tsx src/components/input/confirmation-approval-bar.tsx src/components/analysis/analysis-page.tsx src/types.ts tests/reviewed-inputs.test.ts tests/intake-ui.test.tsx tests/analysis-version-ui.test.tsx test/notes-api.test.ts test/notes-client.test.tsx
```

Production build (synthetic credentials, no live provider/database validation):

```sh
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=sw07-public-test-key SUPABASE_SERVICE_ROLE_KEY=sw07-server-test-key DOCUMENT_INTAKE_API_KEY=sw07-provider-test-key ACADEMIC_AUDITOR_API_KEY=sw07-provider-test-key INDUSTRY_ANALYST_API_KEY=sw07-provider-test-key FEASIBILITY_STRATEGIST_API_KEY=sw07-provider-test-key SYNTHESIS_API_KEY=sw07-provider-test-key npm run build
```

The same synthetic environment was used for `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3117`, followed by `node scripts/access-http-smoke.mjs`; the server was stopped afterward. Synthetic server sentinels are not application secrets.

Initial tests caught a SQL JSON-operator precedence error, then passed after fixing it. The notes client expectations were updated for the revision contract. One full-suite intake UI restoration assertion raced initial hydration; it now waits for the restored editable field. Final counts above refer to the corrected implementation. No failed check is represented as a pass.

The tests verify synthetic F07/I04 behaviors, not full live STD acceptance. Hosted Supabase migration/advisors, live Gemini extraction/analysis, real account/browser flows, counselor evaluation and deployed performance remain unrun. Human review, required passing checks and merge into main are still required. Leave SW-07 in review, not done.

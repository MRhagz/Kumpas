# SW-02: versioned session and run contracts

Baseline: fetched `origin/main` at `ee71c55196006330b090f50ba4e7d8b206f39afc` on 5 November 2026; branch `sw-02`. Existing untracked workspace artifacts were preserved. The team tracker already assigns SW-02 to Moen; that claim is retained.

## Requirements read

The current linked approved sources were fetched before editing:

- [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view): confirmation, data consistency, recovery, retention (KMP-FR-006/018/019, NFR-004/007).
- [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view): §§2.4–2.5; immutable approved profiles; run identity and 300-second deadline; Modules 2.2, 4.1–4.2 and 5.1–5.2.
- [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view): I04 late/duplicate operations and S04 independent draft/PDF expiry boundaries.
- [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view): the task's active requirements and deferred scope.
- [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view): privacy, counselor review, understandable recovery/report lifetimes.

Next 16.2.6's installed Backend for Frontend guide and Supabase's current changelog/database-functions guidance were read. The listed PostgreSQL extension breaking changes do not apply to these built-in column types/functions.

## Contract and reuse

`src/lib/module5/versioned-contracts.ts` defines the shared camelCase application DTOs. Their corresponding database/RPC rows use snake_case. The starting module type surfaces re-export the relevant contracts. Existing legacy DTOs and route behavior remain intact; downstream tasks must explicitly adopt the new contracts. No optional version fields silently imply that legacy data has approval.

The additive migration extends `sessions` with monotonic profile/report counters and the current run ID. Version zero/null means no version-bound record. `profile_versions` stores immutable snapshots and explicit approval timestamps. A correction creates another version; it cannot update a snapshot. `analysis_runs` records the approved version, owner and deadline. `report_versions` contains only private-object authorization metadata, with exact profile/run/report identity and review state.

Server routes must authorize the authenticated owner before calling these **service-role-only, security-invoker** functions, passing the owner from trusted authentication rather than request JSON. Each function locks the same session row, compares expected tokens, then checks wall-clock time after acquiring the lock. Any exception rolls back the entire call. Stale, missing or null expected versions fail closed.

| RPC | Preconditions and effects |
| --- | --- |
| `save_profile_version(session, owner, expected_version, profile, approve=false)` | Active unexpired owner session; append expected+1 snapshot. Approval is explicit, default false. Supersede dependent runs and reports, clear current run, preserve monotonic report counter. Reconfirmation can append a new approved version. |
| `start_analysis_run(session, owner, expected_version, expected_run_id)` | Current snapshot explicitly approved. Compare prior run ID (null for first run) so duplicate starts cannot both win. Supersede prior outputs; record start and deadline=start+300 seconds. |
| `publish_report_version(session, owner, expected_version, run_id, expected_report_version)` | Current running version, before both draft expiry and run deadline. Register the completed generation as draft-ready with database generation time, next report version and `{sessionId}/{reportVersion}.pdf`; complete run atomically. This registration must be part of the downstream generation-ready boundary. |
| `review_report_version(session, owner, expected_version, report_version, decision)` | Current unexpired draft for current run/profile, decision approved/rejected. Review once; no rendering, object replacement or expiry extension. |

Downstream PDF storage must upload without overwrite, publish only after the artifact is ready, and clean up orphaned uploads when publication loses a race. These functions do not perform Storage operations or external calls under the row lock. Downstream output writes must bind to the run/profile tokens and use an atomic server transition, never the TypeScript display helper as a write authorization check.

## Migration and deployment

Apply `supabase/migrations/20261105030355_sw02_versioned_contracts.sql` before consumers of the new contracts deploy. It is additive: legacy JSON, notes, recommendations and workflow progress are retained, with no inferred approval/version backfill. Reconfirmation through the versioned API is required to create a version-bound approval. Legacy sessions with missing owners remain inaccessible to these RPCs. No hosted database was modified.

The migration normalizes every existing draft expiry to `created_at + 24 hours` and enforces this fixed clock on insert/update. Activity cannot extend it. Owner and creation time become immutable. Legacy drafts previously given an incorrect later expiry immediately become expired by the corrected boundary; assess that deployment effect before rollout. There are no new environment variables, credentials or dependencies.

New tables enable RLS with no browser policies/grants. Explicit service-role grants cover invoker RPC operations. Snapshot updates are denied by a trigger. Run deadlines and report generation/expiry identity cannot be updated by the application role. PUBLIC/anonymous/authenticated cannot execute transition functions.

Reports deliberately have no cascading draft/profile/run foreign key: minimal ownership/version/review metadata may survive draft cleanup until `generated_at + 24 hours`. Draft payload and run records cascade with session deletion. SW-20/21/22/23 must integrate storage, exact-current approval/download checks, recovery, termination and scheduled cleanup, including immediate revocation of separately surviving report metadata on explicit termination. Deleting a draft alone is **not** the report termination operation. The existing legacy routes have not acquired these later tasks' guarantees merely by applying this foundation migration. No student self-entry, deferred RTM features or submission PDFs are included.

## Verification

| Exact command | Result |
| --- | --- |
| `git fetch origin main` | Passed after filesystem/network escalation; baseline above. |
| `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/sw02-npm-cache` | Passed with network access: 829 locked packages. Initial sandbox attempt failed with npm `Exit handler never called!`. |
| `node_modules/.bin/vitest run --config vitest.config.ts tests/versioned-contracts.test.ts` | 17 passed: migration safety, UTC/DST fixed durations, immutable versions, explicit approval, stale/null/owner/expiry guards, competing transitions, invalidation, deadline, review-once, regeneration, atomic rollback, metadata survival and privileges. |
| `npm run test:access` | 191 passed in 6 files (includes the 17 new tests). |
| `npm test` | 28 passed in 2 files. |
| `node_modules/.bin/tsc --noEmit --pretty false` | Passed after correcting new test result types. |
| `node_modules/.bin/eslint src/lib/module5/versioned-contracts.ts tests/versioned-contracts.test.ts src/lib/module2/student-profile-builder.ts src/lib/module3/types.ts src/lib/module5/session-state-manager.ts src/lib/report/types.ts` | Passed. |
| `npm run lint` | Fails with 8 errors / 16 warnings in unchanged files; scoped lint above passes. No unrelated lint cleanup included. |
| `git diff --check` | Passed. |

The new GitHub Actions workflow runs the contract tests, typecheck, scoped lint, and `python3 scripts/sw02-concurrency.py` against a fresh PostgreSQL 17 service. The Python check uses separate `psql` connections for real profile/run/publication/review races and a waiter crossing the run deadline while blocked on the parent lock. The local embedded PostgreSQL tests serialize queries; they do not independently establish cross-connection locking. CI outcomes are recorded in the tracker after the PR is published.

Unavailable locally: `psql`/Docker, so the separate-connection script awaits CI; hosted Supabase deployment/advisors and full live STD scenarios were not run. `node_modules/.bin/supabase migration new --help` was terminated with SIGKILL both before and after dependency installation, including an escalated attempt. The migration was consequently authored as a timestamped SQL file and exercised through embedded PostgreSQL, rather than claiming CLI creation/history/advisor verification. Full I04/S04 UI and lifecycle passes require downstream integration; this PR verifies the reusable contracts only.

Leave the tracker in review. Done requires human review, passing required checks, and merge into main.

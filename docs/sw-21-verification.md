# SW-21 — Exact-version report review and release

Implemented locally on 7 November 2026. Changes are uncommitted. The implementation plan was removed after execution as requested. The tracker assigns Jerb and marks prerequisites SW-07, SW-19 and SW-20 Done; those tasks remain complete.

## Behavior

The owner can preview a current draft, approve or reject its exact profile/report/run, correct inputs and explicitly regenerate. Preview reads the existing private PDF and requires SW-19's content/version marker, which identifies the renderer that marks every page Draft. Unmarked legacy drafts require regeneration before preview or approval. Rejection survives refresh and cannot be reversed into approval of the same artifact. Regeneration starts a new timed run, invalidates the prior report and requires approval of the replacement. Refresh alone does not regenerate a rejected report.

Approval reuses the stored PDF without changing its bytes, object key, report version, generation time or expiry. The PDF retains its Draft origin marking; current approval is recorded separately. The report row retains the reviewer, decision, review time and first authorized delivery time for its lifetime. Later invalidation clears release eligibility while preserving the review history. Legacy rows receive no invented review history. These fields share existing PDF cleanup and retention.

The final GET route checks authorization before Storage access and calls a database operation afterward that locks/rechecks current owner/profile/report/run, approval and PDF expiry before releasing any bytes. Completion is idempotent and version-bound. A failed Storage read or stale report does not complete a session. The old POST `/complete` entry point is retired with HTTP 410 for an eligible owner and performs no mutation. Anonymous/other-owner requests retain their authorization denials. Browser tab opening no longer records completion.

Approved PDF reads can outlive the session-draft clock and draft-content purge, up to the independent PDF expiry. Delivery does not revive an expired draft. Explicit Correct Inputs or Regenerate can reopen a completed but unexpired draft; neither extends its lifetime. Saved corrections continue through SW-07's existing invalidation contract. An authorized delivery record does not prove that the user saved a local file.

The UI exposes review state, exact versions, preview, approval/rejection, correction, regeneration and approved inline PDF/native-print access. Pending and ambiguous actions keep release controls locked; reload retrieves canonical state. Focus and periodic server-state checks invalidate stale tabs. Delayed approval cannot unlock a superseded report; a delayed regeneration response cannot start analysis for a different run. Review outcomes restore keyboard focus to the review heading.

## Files

| Files | Purpose |
| --- | --- |
| `supabase/migrations/20261107105108_sw21_report_review.sql` | Review history, token-bound review/correction/regeneration, atomic final-delivery completion; invoker functions and restricted grants. |
| `src/lib/report/access.ts`, `session-completion.ts`; report final/preview/review routes; retired session completion route | Private preview, exact-version review actions and final delivery gate. |
| `src/app/api/reports/route.ts`, `src/lib/report/types.ts`, `src/lib/module5/session-state-manager.ts` | Current identity, review metadata, rejected-state recovery and versioned preview/final URLs. |
| `src/components/analysis/analysis-page.tsx`, `report-download-view.tsx`, `pdf-download-button.tsx`; `src/lib/module5/session-progress.ts` | Review controls, stale-response handling and removal of unguarded browser-driven completion. |
| Existing route/database/recovery tests, `tests/report-review.test.tsx`, `scripts/sw07-concurrency.py`, versioned-contract CI | Focused integration, UI and real concurrency verification. |

## Verification

Linux, Node v24.16.0. Synthetic data and credentials only; no live model calls, paid-provider runs or hosted writes. No helper unit tests or new test dependencies were added. Existing UI/database/route suites were extended. Two representative existing PDF render cases were selected; the full SW-19 content matrix and unrelated extraction/ingestion suites were not rerun.

| Check | Result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/versioned-contracts.test.ts tests/report-delivery.test.ts tests/draft-recovery.test.ts tests/processing-report.test.ts tests/routes.test.ts tests/report-review.test.tsx tests/analysis-version-ui.test.tsx --maxWorkers=2` | PASS: 228 tests before the final additional regeneration-response case. |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/report-review.test.tsx tests/analysis-version-ui.test.tsx --maxWorkers=2` | PASS: final 8 UI checks, including the added superseded-regeneration case. The integration coverage above and this final increment comprise 229 distinct checks. |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/report-content.test.tsx -t 'complete report: Grade 10 science\|renders partial, fewer-path' --maxWorkers=2` | PASS: 2 selected complete/partial render checks; 17 unrelated cases skipped. PDF text/identity/Draft-origin assertions use the existing renderer checks. |
| `PATH=/tmp/sw21-postgres/client/usr/lib/postgresql/16/bin:$PATH PGHOST=127.0.0.1 PGPORT=55421 PGUSER=sw21 PGDATABASE=sw21 python3 scripts/sw07-concurrency.py` | PASS on disposable PostgreSQL 18.6: existing SW-07 races plus five approve/regenerate and five approve/edit races. Either serial ordering leaves the old report out of date with no release approval; stale review/delivery fails and committed review history survives. |
| Local PostgreSQL catalog check for the five new functions | PASS: all security invoker, empty search path, no anon/authenticated EXECUTE. Database integration also exercises successful service-role review/delivery and denied browser roles. |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | PASS. |
| ESLint on every changed TypeScript/TSX file | PASS, no warnings. |
| Python AST parse of `scripts/sw07-concurrency.py`; `node --check scripts/access-http-smoke.mjs` | PASS. |
| Production `npm run build` with synthetic Supabase/Gemini values | PASS outside the restricted sandbox: compilation, TypeScript, prerender and route discovery. The initial restricted attempt stalled during compilation and was stopped; its result is not a pass. |
| Browser-output synthetic service-key scan; `git diff --check` | PASS. |
| `KUMPAS_BASE_URL=http://127.0.0.1:31422 node scripts/access-http-smoke.mjs` | PASS against the production build: 22 unauthenticated API denials, including preview/review; 2 protected-page redirects; 1 login check. |

The initial integration run caught two fixture errors: an attempted expiry change violated the existing fixed 24-hour PDF constraint, and a legacy assertion depended on being the first test in the file. The fixture now preserves the clock constraint, and the legacy assertion checks its own session. Subsequent checks passed. The first HTTP server start exited because required synthetic provider keys were missing; the successful start supplied the same complete provider-key set as CI. Vitest continues to report the existing future native-config-loader warning.

Chromium used the actual analysis/review components and project Tailwind CSS, with frozen synthetic API responses and an existing synthetic PDF, at 1280- and 390-pixel widths. Both viewport checks passed keyboard approval/rejection/regeneration/correction, review-focus restoration, stale-tab blocking and no horizontal overflow. Preview and final fixture SHA-256 matched: `3a0108fd69d8092359e9b64b6262f982b805d8596c65406593d3e443af1a61e3`. Screenshots, browser script/results and logs are under `/tmp/sw21-browser`. This establishes changed UI behavior with a synthetic backend; it is not a hosted two-account or full live workflow acceptance run. Approved inline PDF/native-print entry is present; no operating-system print dialog/printer or unsupported browser run is claimed.

The PostgreSQL binaries/client and browser harness were isolated under `/tmp`; application dependencies were unchanged. Supabase CLI generated the migration after its home-state telemetry write was permitted outside the sandbox. Current Supabase changelog, database-functions/private-download guidance and installed Next.js Route Handler docs were checked. CLI v3 changes were reviewed; the installed CLI remained v2.122.1. No CLI upgrade was performed.

## Rollout and limits

Apply the additive migration after the existing SW-02/15/07 contracts and before deploying the paired API/UI. Use the existing private report bucket and environment configuration; no new secrets or browser storage are introduced. Legacy tabs must reload the current review flow. PDFs remain immutable and expire on their original generation clock.

No hosted migration/advisors, live Supabase Storage/two-account check, deployment, tracker update, commit, push, tag or PR was performed. Submission documents were not edited. Hosted authorization/Storage behavior, OS printing and broader workflow/browser acceptance remain their assigned release checks.

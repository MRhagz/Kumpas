# SW-30 runtime and release verification

## Current checkpoint — 8 November 2026

The paid-tier deployment confirmation below is complete. The user also waived
the isolated hosted restore drill because of the free-project limit; hosted S10
and measured RPO/RTO are excluded, not passed. These decisions supersede older
release conditions in this document and PR #74.

The upload implementation is prepared locally, including the migration and tests
described below. The migration was applied through Supabase MCP to the Kumpas
project on 8 November at 09:15 UTC, registered as
`20261108091527_sw30_temporary_intake_uploads`. The local filename matches that
hosted version; its SQL is unchanged from the reviewed migration. The matching
application has **not** been deployed. Vercel CLI has no saved credentials in this workspace, and the user
confirmed they do not have Vercel access. The existing GitHub integration can
deploy an eligible push to `sw-30`; a manual CLI login is not required for that
path. The migration prerequisite is now satisfied for Kumpas; verify the automatic candidate
deployment before hosted 10 MB boundary, P01/P02 and A01 checks can pass.
Changes remain uncommitted; no push, PR creation or merge was performed.

After explicit approval for the production cleanup execution,
[manual maintenance run 42464753589](https://github.com/MRhagz/Kumpas/actions/runs/42464753589)
on existing `main@fa95cef` passed on 8 November at 08:52 UTC. Both
`session_cleanup` and `report_cleanup` reported success; total runner wall time
was about 7.6 seconds. Read-only before/after checks found zero expired/cancelled
sessions, document/report cleanup rows, legacy document objects and expired
report versions. This establishes an empty repeat sweep through GitHub Actions,
not deletion of a new synthetic fault fixture or qualification of unmerged code.
Automatic approval review initially rejected the trigger because its production
deletion scope lacked explicit approval. The user reviewed the empty scope and
explicitly approved this exact run before it was dispatched.

A successful scheduled trigger and failure-notification receipt still need to
be observed. The latest inspected scheduled run was an older failure; green
PR verification jobs do not run production cleanup. No deliberate production
failure or notification message was sent.

## Private resumable intake uploads

The user approved temporary private raw-file storage on 8 November. Academic
documents and prepared note photographs now use direct resumable uploads to
Supabase Storage. The counselor app and extraction remain Next.js/Vercel; Python
ingestion remains in Actions. The browser sends only metadata and an upload
reference through Vercel, avoiding its multipart ingress limit without resizing
or dropping PDF pages. Legacy multipart handlers remain for compatibility;
large uploads must use the new reference flow.

Migration `20261108091527_sw30_temporary_intake_uploads.sql` adds:

- A private `kumpas-intake-temp` bucket capped at **10,000,000 bytes**, with
  supported image/PDF types and an octet-stream fallback for files whose browser
  MIME is missing. Decoded content and size are rechecked before any provider call.
- Session-bound, ten-minute upload reservations and a six-minute processing
  recovery allowance. Academic reservations retain existing token/version guards;
  notes reservations bind to the saved notes revision and block input approval.
- Restrictive Storage policies permitting an active counselor to insert only at
  an owned pending reservation. Client reads, signed reads, overwrites and deletes
  are denied, including in the presence of an older broad permissive policy.
  Internal mutation RPCs remain invoker functions executable only by service role.
- Cleanup rows registered transactionally **before** upload authorization. Both
  raw objects and their cleanup metadata survive cancellation/session deletion.
  Successful Storage deletion cascades away staging metadata; failed deletion
  retains its queue lease/backoff for retry. Expired/abandoned work and orphaned
  completed objects are inventoried by the existing maintenance path.
- A bucket-aware cleanup RPC. The old cleanup RPC is restricted to the legacy
  bucket so an already-deployed worker cannot acknowledge deletion against the
  wrong bucket during rollout.

The browser uses `tus-js-client` with six-MiB protocol chunks, one transient
retry and no upsert. No upload URL, filename, token or file content is persisted
in browser storage. The server retrieves bytes privately, validates the actual
file and expected byte count, renders every PDF page and invokes existing paid
extraction. Success and failure both schedule raw-object deletion. A killed
invocation remains recoverable from the pre-existing cleanup row.

Reservation expiry denies access; it is not a guarantee of physical deletion at
that instant. Scheduled collection and retry backoff are best effort. Incomplete
TUS transfers are also subject to Supabase's protocol/service cleanup lifecycle;
the application checks completed bucket objects, not provider-internal chunks
or backups. The processing notice and README describe temporary storage.
Approved submission documents/PDFs are unchanged; their raw-storage wording
needs alignment in the later document handoff.

### Deployment owner handoff

1. Review the uncommitted change. The migration has already been applied to
   Kumpas through MCP, with a pre-migration schema snapshot retained in ignored
   `.private/sw30/pre-migration-schema.json`. For other deployment targets,
   preserve a backup and apply the migration **before pushing `sw-30`**, since the connected Vercel
   integration may immediately deploy the matching app/maintenance routes.
   Use a quiet intake window and admit uploads only after smoke verification.
   There are no new production secrets or paid-project evidence requirements.
2. Verify academic and notes uploads on the identified candidate: exact
   10,000,000-byte acceptance, 10,000,001-byte rejection, decoded-content rejection,
   cross-owner/expired/replayed reference denial, interrupted transfer, replacement
   preservation and actual raw-object deletion. Exercise failed deletion and
   abandoned reservations in an isolated synthetic fixture. Do not publish keys,
   signed URLs, student data or real filenames as evidence.
3. Run a fresh diagnostic with the existing feasibility LOW-thinking fix, then
   freeze the candidate/deployment and run the complete P01/P02 workloads below.
   Replace used/expired sessions; a new browser context does not prove a cold
   server. Existing synthetic retry state reached `report_pending`, but no ready
   PDF or complete campaign was observed, so no 300-second end-to-end pass is
   claimed.
4. Observe scheduled maintenance and notification delivery, and complete the
   A01 counselor walkthrough on that same candidate. Record actual results and
   accepted exclusions, then obtain human review and merge before marking Done.

Do not roll cleanup back to a version unaware of the new bucket while staged
objects or their queue entries remain. Keep bucket-aware cleanup available until
both are empty; the compatibility guard prevents false acknowledgements but does
not make an old worker capable of draining the new bucket.

Baseline: fetched `main@fa95cef` on 8 November 2026; isolated branch `sw-30`
in `/private/tmp/kumpas-sw-30`. The original dirty checkout was preserved.
Moen's existing tracker claim was retained. SW-15/20/23/27/29 are all Done in
the [team tracker](https://kumpas-team-tracker.jrvnryle.chatgpt.site/); no waivers.
Their merged code is present. Completed prerequisite tasks are not reopened.

Read the linked approved [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view),
[SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view),
[STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view),
[RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view)
and MVP findings through Drive. Scope: NFR-005/011/016; STD P01/P02/S10/A01,
SDD runtime separation and ProcessingBudget. SW-05's explicit paid-extraction
decision overrides only the affected masking requirements. Grade 10/SHS
counselor operation, access controls and retention remain. No submission PDFs
or approved documents are changed. Privacy/extraction document reconciliation
remains a later handoff.

## Runtime configuration

`vercel.json` explicitly enables Fluid compute. Analysis, report generation,
extraction and the two lifecycle endpoints declare Node runtime and 300-second
allowances. These are invocation limits, not a new processing deadline. The
SW-15 persisted approval-to-PDF budget and stale-run publication guards remain.
`release:verify-build` verifies all seven allowances in the generated Next.js
manifest. Non-JSON hosting 502/503/504 responses now explain saved-input
recovery and the hosting settings to inspect, instead of displaying a JSON
parse error. An interrupted worker becomes retryable after its saved deadline;
never restart an active run or reset its clock automatically.

The initial checkout's installed Next package lacked `dist/docs`. The isolated
locked install supplies the guides; read its Route Handlers, runtime and
maxDuration references before editing. Also checked the current official
[Vercel duration reference](https://vercel.com/docs/functions/configuring-functions/duration)
and configuration JSON schema. Fluid compute supports a 300-second allowance
on Hobby; Pro/Enterprise have higher limits. This release requests 300 seconds.
Inspect the actual deployment's effective settings; source exports and a local
build cannot prove the hosted plan/limits or successful long execution.

Use a supported Node version (Actions uses 22; local verification records its
actual version). Deploy the app from the repository root. There is no Python
runtime deployment or cross-invocation local filesystem store. Durable profiles,
runs, deletion queues and private PDFs remain in Supabase.

## Scheduled execution and recovery

Keep the existing `Session and PDF retention` Actions scheduler as the sole
lifecycle scheduler. No Vercel cron with a second credential scheme is added.
It runs every 15 minutes on main, with manual dispatch on main as fallback.
Production sweeps cannot overlap within this workflow; PR verification has its
own concurrency group. The job has a 15-minute limit; the runner has a 12-minute
deadline, with a separate six-minute budget for each capability, at most 20
batches per endpoint and ten-session request batches. A slow session backlog
cannot consume the PDF retention budget. Each HTTP request allows up to 310
seconds, capped by its capability's remaining budget, so the 300-second function
can finish when enough time remains.
Network/429/5xx failures receive at most one retry, respecting Retry-After up to
60 seconds and the remaining capability budget. Unauthorized/redirect/malformed
responses fail. Both capabilities are attempted even if the first fails.

A response must contain the expected counts and result fields; a 200 login
page is not successful cleanup. Warnings/backlogs fail the job. Durable artifact
leases/backoff still belong to SW-23; pending deletion waits for its eligible
next sweep rather than bypassing backoff. A killed runner leaves durable work
discoverable. Logs contain stages, counts and fixed codes, not response bodies,
headers, URLs, keys or content. Missing configuration names are safe to report.

Configure the protected GitHub `maintenance` environment:

- Variable `KUMPAS_APP_URL`: deployed HTTPS origin, no path/query/credentials.
- Secrets `SESSION_CLEANUP_SECRET` and `REPORT_RETENTION_SECRET`: distinct,
  matching the server-side Vercel environment. Counselor JWTs do not authorize
  either route. Never reuse the service-role or Gemini key for these values.
- Protect main, enable failed-workflow notifications and name a monitoring owner.
  Observe a real scheduled successful run, notification delivery, queue/backoff
  recovery and last-success age. GitHub scheduling is best effort, not a
  guaranteed 15-minute physical-deletion SLA.

For a disposable staging test, preserve one unexpired owner draft/PDF and create
expired/cancelled synthetic records plus a queued deletion that fails once.
Capture restricted before-state counts, execute the runner, then verify actual
payload and Storage deletion, cleared retry rows and preserved valid records.
Run again to verify idempotence. Retain only sanitized counts/run IDs and the
Actions run link. Do not treat route availability as evidence of deletion.

**Historical deployment blocker, superseded by the current checkpoint:** GitHub Actions schedule
[42426925002](https://github.com/MRhagz/Kumpas/actions/runs/42426925002)
on `4b0f9cc`, 7 November 2026 23:48 UTC, failed with
`cleanup_configuration_invalid`. Its step environment shows all three variables
empty. Repository and maintenance-environment variable lists were empty on
8 November. Two earlier inspected scheduled runs also failed. PR-triggered
successes skipped the cleanup job. No successful deployed sweep is claimed.

Python ingestion stays in its four Actions workflows, with existing scoped
ingestion credentials and source contracts. Production jobs now use the
`ingestion` environment and a 30-minute cap. Restrict that environment to main;
coordinate manual/push ingestion outside active counseling and frozen load
measurements. CHED moves from Monday 10:00 Manila to Monday 02:20 Manila
(Sunday 18:20 UTC). Existing per-source concurrency is preserved; one shared
Actions concurrency group could discard queued refreshes from different sources.
The environment gate requires operator setup; it is not a database activity lock.

## Paid Gemini deployment confirmation — complete

**ABSOLUTE CONFIRMATION: the deployed app uses the approved paid-tier Gemini
project, with billing enabled.** The user explicitly confirmed this on
8 November 2026 and directed that this confirmation be accepted as conclusive
for SW-30. Paid-project verification is complete; no additional console evidence,
project-ID record, screenshots or request/usage correlation is required.

This records the user's confirmation, not an independently performed console
inspection or extraction test.

Keep SW-29's `gemini-3.8-flash`, `v1beta`, fixed HTTPS Gemini origin and
768-dimensional `gemini-embedding-001`. All image routes use
`DOCUMENT_INTAKE_API_KEY` through the shared server-only request helper. There
is no fallback project/key. Preserve the separate specialist/synthesis keys and
scoped ingestion configuration. No provider credentials go into browser code.

This decision supersedes earlier SW-30 requirements for independent paid-project
evidence. SW-29 remains Done. Functional extraction and performance tests retain
their separate acceptance criteria. The SW-05 decision permits approved images
without local masking; application cleanup, paid billing and provider retention
remain separate facts.

## Repeatable P01/P02 measurement

Install the locked dependencies and the pinned Playwright browser:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
mkdir -p .private/sw30
npm run release:measure -- .private/sw30/workload.json .private/sw30/results.json
```

Use an isolated Vercel candidate and five provisioned synthetic counselor
accounts. Save Playwright storage state locally for each account. Prepare a
**fresh, saved, unapproved intake session for every attempt**, using synthetic
full (three academic records), partial (one or two) or notes-only inputs.
Complete upload/extraction/correction before running; the driver checks document
counts but human dataset review must establish representative quality and size.
Do not reuse sessions or real student records. Keep auth files/manifests/results
under ignored `.private/sw30/`; result files are created exclusively, mode 0600.

Example manifest shape (one-wave rehearsal, not full P01/P02 coverage):

```json
{
  "url": "https://candidate.example.test",
  "commit": "REPLACE_WITH_40_CHARACTER_CANDIDATE_SHA",
  "deploymentId": "REPLACE_WITH_VERIFIED_VERCEL_DEPLOYMENT_ID",
  "syntheticOnly": true,
  "hardware": "Record client CPU, RAM, OS and browser host",
  "network": "Record connection, RTT and bandwidth",
  "providerQuota": "Record approved project/model and quota",
  "databaseTier": "Record Supabase tier/region",
  "sourceSnapshot": "Record knowledge manifest hash and size",
  "providerVerificationRecord": "User absolute confirmation of approved paid-tier deployment, 2026-11-08; docs/sw-30-runtime.md",
  "waves": [{ "kind": "sequential", "sessions": [{
    "sessionId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "storageState": "counselor-1.json",
    "account": "synthetic-c1",
    "profile": "notes"
  }] }]
}
```

Replace deployment and workload example values; the recorded user confirmation
is sufficient for `providerVerificationRecord`, with no additional paid-project
evidence required. `storageState` paths are relative to the manifest.
Wave entries run together after preparation; waves run sequentially. Use:

- P01: five excluded single-session `warmup` waves; thirty `sequential` waves,
  ten each `full`/`partial`/`notes`; three additional single-session `cold` waves.
  Document how cold **server** state was established; a new browser context alone
  does not establish it.
- P02: five `concurrent` waves of five sessions, each with distinct synthetic
  account labels and auth files; then one separate ten-session `stress` wave.
  Confirm the auth files actually belong to distinct accounts. Stress results
  characterize limits and are never merged into the qualification sample.
- Freeze build, deployment, workload order, hardware/network, source snapshot,
  model/quota and thresholds before running. Inspect Vercel's deployment metadata
  to establish the commit/deployment mapping. Manifest identity is an operator
  record, not an independent runtime attestation. Prevent ingestion overlap.

The timer starts at the browser's actual approval click and ends at visible draft
PDF readiness. It includes the approval request, analysis and PDF publication.
Human preparation and final release/download remain outside it. No automatic
retry/reapproval is performed by the driver. It records response identity/run
tokens to detect session mismatch without storing report content. Per-wave and
per-cohort reports include every attempt, success/failure/timeout, wall duration,
successful throughput, error rate, min/median/nearest-rank p95/max latency and
the every-run 300-second gate. Warmups, cold runs and stress stay separate.
Run IDs correlate with safe server diagnostics. Progress is flushed each wave;
`completed: false` means an interrupted campaign and cannot pass qualification.

The driver does not assert fault recovery or complete STD acceptance. Repeat
transient/fault scenarios separately in isolated test services and retain
SW-15 retry/deadline evidence; never add a production fault-injection endpoint.
Report the entire attempted campaign, including setup failures. Missing workload
coverage cannot pass P01/P02 merely because a smaller sample was fast.

## Backup/restoration and release gate

Use the existing [SW-23 isolated restore procedure](sw-23-verification.md#restore-procedure-std-s10)
and `scripts/retention-recovery.mjs`. The proposed logical PostgreSQL backup plus
separate private Storage snapshot must be selected/approved for the actual
deployment. Record the named restore owner, backup identifiers/timestamps,
frequency, encrypted location, retention, agreed RPO/RTO and notification contact
**before** a staging drill. No production backup mechanism or recovery window
has been confirmed by this coding task.

Inspect [Supabase's backup documentation](https://supabase.com/docs/guides/platform/backups):
database backups exclude Storage bytes. Preserve required auth/owner mappings,
knowledge tables/vector indexes/ingestion metadata and current migrations.
Keep the current deletion ledger independently of snapshots; quiesce writes and
export it after quiescence. Restore only into a network-isolated target, replay
the ledger and current expiry rules, run both cleanup endpoints, and verify
owner/cross-owner access and absence of expired/terminated content before
reopening. Missing/stale ledger or failed cleanup keeps access closed. Measure
actual RPO/RTO; command availability is not a successful S10 restoration.

The original implementation introduced no database migration, bucket or
production credential. The private-upload follow-up adds the migration and bucket
described above, with no new credential.
Existing prerequisite migrations must already be applied, including SW-23 and
SW-27. Deployment changes: explicit Fluid compute, cleanup function durations,
Actions execution bounds/environment gates, CHED schedule and client error text.
Recovery semantics and privacy boundaries remain unchanged.

SW-30 remains **In review**, not Done, until human review, required passing
checks and merge. Paid-project verification is complete by the user's explicit
confirmation above. Qualification of the matching deployed maintenance code and
full P01/P02 remain release conditions. The hosted S10 drill is excluded by the user's waiver;
agree any handoff/task split before claiming completion. A01 and stakeholder
acceptance must use observed evidence, never inferred passes.

## Executed checks

### Private-upload follow-up, 8 November 2026

Verified locally on Linux with Node `v24.16.0`, against the uncommitted follow-up
to `635f0a3`. The hosted migration was subsequently applied through MCP as
recorded in the current checkpoint. No new app deployment or live paid-provider
call was performed in this follow-up.

| Command/check | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/sw30-npm-cache` | Passed; locked dependencies installed. |
| `npm run test:access -- --maxWorkers=2` with subprocess access | **771 passed**, 52 files, including temporary-upload SQL/RLS, owner and replay guards, staged academic/notes extraction, cleanup bucket selection and protected-route inventory. |
| `npm test` | **28 passed**, 2 files. |
| `npm run test:upload` | **64 passed**, 6 files, including exact 10 MB staged extraction and failed validation/provider cleanup. |
| `node --test scripts/release/metrics.test.mjs` with subprocess access | **3 passed**. |
| `node scripts/provider-e2e.mjs` | Production Webpack build and **14 synthetic HTTP/startup/provider/bundle checks passed**; zero live provider calls. |
| `npm run release:verify-build` | Passed: seven generated 300-second allowances, explicit Fluid compute and native Sharp/libvips tracing in all six relevant functions. |
| `npx tsc --noEmit --pretty false` | Passed, including after the final formatting changes. |
| Scoped ESLint for every changed TypeScript/JavaScript file; `node --check scripts/release/measure.mjs`; `git diff --check` | Passed. |
| Chromium keyboard and WCAG 2.1 AA fixture workflows at 375 px and 1280 px | **2 passed**. Intake, review and download each reported zero violations and zero needs-review findings. |
| README first-person scan and local links in README/runbook | Passed; README uses Kumpas/the system and contains no first-person wording. |

The final database-only recheck also passed after giving the second test
counselor its own valid Auth session, so cross-owner rejection is tested with
an authenticated active counselor rather than relying on an invalid session.

Pre-commit review reproduced an abandoned-upload backlog bug with 101
reservations: the bounded inventory released 100, but the cleanup claimant could
select the remaining older queue entry first and cascade away its tracking row
without releasing its document reservation. `claim_intake_cleanup` now excludes
staging rows until inventory has moved them to `cleanup`. The regression first
failed, then passed with the fix; all 33 focused database/cleanup tests and the
full 771-test workflow suite passed. This keeps approval from remaining blocked
by an abandoned empty document reservation after its tracking row is gone.

Post-migration MCP verification confirmed a private bucket with a 10,000,000-byte
limit, RLS on staging metadata, four Storage policies, no anonymous metadata
read, no authenticated metadata insert or upload-token read, and service-only
invoker mutation RPCs. The backlog guard is present in the hosted cleanup
function; a zero-limit cleanup claim returned no rows and staging is empty.
The security advisor reported the same pre-existing findings as before this
change, with no new finding for the migration: service-only tables without read
policies, `vector` in public, the existing `rls_auto_enable()` function grants and
disabled leaked-password protection. These unrelated settings were preserved;
see [Supabase's advisor reference](https://supabase.com/docs/guides/database/database-linter)
for their existing remediation guidance.

Initial failures are retained in the work history: sandboxed maintenance tests
could not spawn Node (`EPERM`); all eight passed with subprocess access. New
imports required the existing multipart test fixtures to mock the additional
server Storage boundary; those fixtures were corrected without weakening their
assertions. Two build attempts encountered stale Webpack icon references; the
fresh locked package had zero missing imports and the obsolete filename was
found in generated cache. Moving that cache aside produced the passing build,
with no icon package upgrade. The local browser runner initially lacked its
matching binary and then required corrected config import/working-directory
resolution; the final run uses the repository's unchanged assertions.

The ignored browser override uses the pinned Playwright package's Chromium
headless shell `158.0.8127.18`; it does not claim new Chrome/Edge/Firefox/WebKit
results. Its command was:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/sw30-playwright npx playwright test --config .private/sw30/browser.config.mts
```

The two-width results are synthetic fixture accessibility checks, not hosted
upload, paid extraction, P01/P02 or stakeholder acceptance results. The successful
production maintenance run and its limited scope are recorded in the current
checkpoint above. The remaining deployment owner checks are listed in the
handoff; SW-30 stays In review.

### Review follow-up, 8 November 2026

The maintenance runner now gives each capability at most six minutes within the
existing twelve-minute job budget. Regression tests first reproduced both a
slow, full session backlog skipping the PDF endpoint and repeated session
timeouts leaving too little time for PDF retention. With the fix, PDF retention
receives a full request allowance and completes in both cases; incomplete
session cleanup still fails the job visibly. On Node `v22.16.0`, the maintenance,
retention-cleanup and retention-database suites passed **24 tests**, and the
metrics suite passed **3 tests**.
TypeScript (`node node_modules/typescript/bin/tsc --noEmit --pretty false`),
scoped ESLint for the runner and regression tests, script syntax and
`git diff --check` also passed after the locked dependency install.

At this review checkpoint, hosted prerequisite compatibility, verified knowledge
refresh, live cleanup, P01/P02 and hosted S10 were unclaimed. Paid-project status
is now confirmed by the user as recorded above. Retain
deployment inventory and provider account details in restricted operational
records. Preserve the operational backup before enabling cleanup or deploying
migrations; these deployment checks do not change completed tracker states.

The repository SRS backup requirement (`docs/SRS_clean.md`, Backup and Recovery)
specifies a documented mechanism, restore owner and acceptable recovery window,
but neither the SRS nor SDD specifies a numeric RPO or RTO. Do not present a
chosen target or an unperformed drill as an approved or measured result. An
isolated hosted target still needs to be selected.

### Original implementation checks

Local verification, 8 November 2026, Node `v24.13.1`:

| Exact command | Outcome |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund --cache /private/tmp/sw30-npm-cache` | Network-enabled retry passed, 842 packages. The sandboxed first attempt was interrupted (exit 130); no pass claimed for it. |
| `npm run test:access -- --maxWorkers=2` | **727 passed**, 49 files, final application changes. An earlier run exposed one outdated cleanup fixture; it was updated for the verified response contract and rerun. |
| `npm test` | **28 passed**, 2 files. |
| `node --test scripts/release/metrics.test.mjs` | **3 passed**: statistics, complete workload coverage, unsafe/reused-input rejection. |
| `npm exec -- tsc --noEmit --pretty false` | Passed. Initial new subprocess test lacked typed `NODE_ENV`; corrected and rerun. |
| `npm exec -- eslint scripts/run-retention-cleanup.mjs scripts/release src/lib/processing-http-error.ts src/components/analysis/analysis-page.tsx 'src/app/api/sessions/[sessionId]/analyze/route.ts' src/app/api/reports/retention/route.ts src/app/api/sessions/expired/route.ts tests/maintenance-job.test.ts tests/analysis-version-ui.test.tsx` | Passed. |
| `/private/tmp/sw10-actionlint/actionlint .github/workflows/sw23-retention.yml .github/workflows/sw30-runtime.yml .github/workflows/ingest-ched.yml .github/workflows/ingest-psa.yml .github/workflows/ingest-dole-ble.yml .github/workflows/ingest-tesda.yml` | Passed, existing local actionlint binary. |
| `node --check scripts/release/measure.mjs`; `node --check scripts/run-retention-cleanup.mjs`; `git diff --check` | Passed. |
| `npm run lint` | Existing **2 errors, 12 warnings**. Errors: `src/app/page.tsx:48` synchronous state update in effect; `src/components/analysis/pdf-modal.tsx:66` unescaped apostrophe. Both files are unchanged from main. |
| `npm run release:verify-build` | Passed against final local production build: seven 300-second route allowances and Fluid configuration. |

The final successful build command used **synthetic placeholders only**:

```sh
env NEXT_PUBLIC_SUPABASE_URL=https://release-fixture.supabase.test \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon \
  SUPABASE_SERVICE_ROLE_KEY=synthetic-service \
  DOCUMENT_INTAKE_API_KEY=synthetic-intake \
  ACADEMIC_AUDITOR_API_KEY=synthetic-academic \
  INDUSTRY_ANALYST_API_KEY=synthetic-industry \
  FEASIBILITY_STRATEGIST_API_KEY=synthetic-feasibility \
  SYNTHESIS_API_KEY=synthetic-synthesis npm run build -- --webpack
```

An initial build without the required placeholders failed at page-data collection
(`supabaseUrl is required`); it is not counted as passing. No live credentials
or external provider calls were needed for the successful build. PR CI runs the
normal `npm run build` on Node 22 and checks the same generated metadata.

The cleanup subprocess tests exercise failure, retry, authentication, malformed
200 responses and batching with synthetic HTTP boundaries. The browser driver
has syntax/statistics/input checks, but its complete live campaign is **not run**.
No live performance, independent paid-project inspection, hosted backup, notification receipt or
successful scheduled-deletion result is implied. CI/deployment outcomes and the
PR link are recorded in the PR and tracker after publication.

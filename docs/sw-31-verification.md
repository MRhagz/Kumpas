# SW-31 integrated release verification

## Candidate and scope

Started 8 November 2026 from merged `bc336abb1422832141ab089557d14ad842fb38c9`
(SW-30 PR #74). All prerequisites are Done in the team tracker; the existing
Jacob assignment is retained. This branch is `sw-31`. SW-30's original checkout,
branch and prepared synthetic workload are preserved.

Read the current approved SRS, SDD, STD, RTM and MVP findings from the task's
Drive links. This record supports STD R01/R02/R03/A01/P01/P02; it does not edit
those documents or submission PDFs. Historical `7da1efc` and `8eae991` results
are reproduction history, never evidence of this candidate passing.

SW-05 local masking and deletion-before-external-extraction cases are **waived**,
not passed. Paid-project deployment confirmation is recorded in merged
`docs/sw-30-runtime.md`; it is an operator confirmation, not a new independent
console inspection or a zero-provider-retention claim. Private staging, safe
logs, temporary-file deletion, owner isolation and counselor review stay active.
The hosted isolated S10 drill was excluded in SW-30; no hosted restore or measured
RPO/RTO pass is inferred. Human/stakeholder validation remains after the midterm.

## Reproduced code defects

- Full lint initially failed on the landing page's synchronous mount effect and
  an unescaped PDF fallback apostrophe. Deterministic decorative markup now renders
  directly; navigation is unchanged. The fallback uses plain escaped-safe wording.
- PSA's `file://` loader treated an encoded URI as a literal path. On Windows,
  five failure observations prevented the valid parser/CLI and failure-boundary
  tests from reaching their intended code. Native URI conversion now preserves
  drive paths and decodes spaces; remote hosts/query/fragments are rejected.
- A historical-score PDF/UI regression found no AI disclosure in the legacy
  report UI when its student summary was absent. The common report header now
  discloses AI assistance regardless of summary availability. The same fixture
  checks the exact 84.50, 79.45 and 71.55 totals through calculation/UI/PDF and
  guards against the invented 1970 source date.
- Missing operational-log database configuration previously exited without a
  named setup error. The job now names the missing variable without exposing it.
- Repeated live timeouts exhausted the shared clock during feasibility
  generation. A regression reproduced the absence of an operation timeout and
  the loss of remaining successful outputs to a hung specialist. Specialist
  generation now permits two attempts of at most 75 seconds, separated by the
  existing bounded retry delay; the parallel stage has at most 180 seconds
  inside the original run deadline. Stage timeout preserves valid other outputs
  for explicitly partial synthesis. A global deadline or stale version still
  stops the run. Fake-clock regressions pass; live candidate qualification is
  pending and the original measured failures remain unchanged.
- The ranking response example omitted `siloId` although strict citation
  validation requires the supplied silo identity. A contract regression fails
  against that example and passes after it is corrected. Foreign-silo and
  unsupported-citation rejection remain unchanged. This mismatch can make valid
  explanations unavailable; the observed live case's precise provider response
  was not logged, so no raw-response cause is asserted.
- Refreshing during live SHS analysis exposed a publication race. The browser
  received a stale-publication error while the same run had a saved draft.
  The session read can precede publication while the run read sees the newly
  ready version. Recovery now rechecks the same unexpired owner, profile, run
  and report version in that case. The reproducing fixture fails before the fix.
  Superseded versions still fail, and legacy ready runs keep their stored pointer.
- The desktop Firefox audit on `6b3717c` flagged the Personal Interests &
  Strengths label for color contrast. The label now uses the darker color of its
  icon, raising the nominal foreground/background ratio from 4.93:1 to 6.73:1.
  The mobile scanner crash on that run recovered on a fresh-process retry.

No production fault endpoint, deferred feature, schema migration, provider/model
change, credential fallback or data migration is introduced. Existing warnings
are recorded separately from lint errors. CI adds full lint, legacy regressions
and Windows/Linux operator-ingestion coverage; existing application/database,
OCR and browser jobs continue to verify the same head.

## Completion follow-up — 9 November 2026

The original local checkout remains untouched; this work uses a separate
`sw-31-finish` worktree based on `17ca70b`.

The Firefox failure was reproduced locally with Playwright 1.65.0/Firefox 159.
The upstream [ARIA reflection regression #43967](https://github.com/microsoft/playwright/issues/43967)
matches the native SIGSEGV. Its minimal two-world labelled-button reproduction
crashes on 1.65.0 and passes on 1.64.1. Pin the test runner and axe's
`playwright-core` peer to 1.64.1. Original role/name assertions, default axe
aggregation and every WCAG rule remain enabled. JIT changes and CSS-only
readiness selectors were diagnostic attempts and are not included.

`npm run test:browser -- --project=firefox --grep 'keyboard workflow' --repeat-each=5`
passes ten workflows on Firefox 157.0: thirty complete scans, zero violations,
zero incomplete checks and no crash retries. Chrome 157 passes both workflows
and six complete scans with zero violations/incomplete checks. Hosted CI on
the follow-up commit remains a separate gate. Application verification passes
784 access tests, 28 legacy tests, four metrics tests and full lint with zero
errors / twelve existing warnings. Type checking also passes after aligning
the Playwright peer. The production Webpack build and build-contract check pass.
The documented inherited `--env-file` worker restriction was reproduced; the
passing build loads the private env in its parent and launches Node without that flag.

Existing authorized preview access and all five synthetic counselor accounts
work. The seven unmocked live contracts pass on preview `17ca70b`, deployment
`HYgQzDgeuXf7AuDDY3G6ieHYxDAw`, including actual 10,000,000-byte extraction,
physical raw-object inventory, required/optional fields and owner/maintenance
denials. The first run retained a failed anonymous assertion because it met
Vercel's hosting login redirect. The runner now optionally accepts
`VERCEL_AUTOMATION_BYPASS_SECRET` for all three actors, including anonymous;
application authentication still denies the anonymous actor with 401. Redirects
are disabled and these request contexts target only the manifest origin.

A fresh notes-only browser diagnostic on that preview becomes draft-ready in
139.777 seconds, with AcademicAuditor and IndustryAnalyst successful and
FeasibilityStrategist failed. It is recorded as **partial**, not a P01/P02 pass.
A separate instrumented real Feasibility call with the saved synthetic profile
and the local credential passes; this does not establish the deployed key's
identity or qualify the hosted provider. Restricted Vercel logs for the synthetic
run show its first feasibility generation reaching the 75-second attempt limit,
then a failed second attempt; total feasibility time is 79.538 seconds. Only
safe stage/timing/code fields were read out. No provider response body was exposed,
and the second failure's specific provider cause remains unknown. No new full
performance campaign is claimed while that failure remains unresolved.

The project's active publishable key was configured in GitHub's `ingestion`
environment. The scoped worker JWT and maintenance database URL remain missing.
The expired cached Vercel token initially returned HTTP 403; the official CLI
successfully refreshed the existing login and inspected the scoped deployment.
No replacement API token is required. The native Safari preview opens at
Vercel's login page; its authorized walkthrough and human acceptance remain
open. See the [credential locations and execution handoff](sw-31-operator-handoff.md)
and [sanitized follow-up evidence](evidence/sw-31-completion-followup.json).
The live observations above attest `17ca70b`; they do not attest a later deployment.

Follow-up `6c92aa7`, Vercel `dpl_GQgg4t8dUQ5HyyVYxnjatK8vBUoS`, is Ready;
its exact Git SHA was verified through Vercel's deployment API. All seven live
contracts pass again on that deployment. Hosted Firefox completes its mobile
workflow without a crash, but the desktop intake scan reports a contrast
assertion on nine targets within the nested editable-notes panel. The audit
waited for only the first fade-in panel. It now waits for every fade-in panel's
opacity to reach 1 before scanning, retaining the contrast assertions. Six
local Firefox workflows and eighteen scans pass after this change with zero
violations, incomplete checks or crash retries. The failed hosted contrast run
is retained; the updated head still needs a complete passing CI run.

## Live runner

`scripts/release/live-contracts.mjs` uses actual HTTP and Supabase Storage, with
no request interception, provider mock or database adapter. It requires private
Playwright owner/other-owner state files for provisioned synthetic counselors.
These files must be restricted to the operator and excluded from artifacts.
The manifest identifies the deployed commit and deployment externally; the
runner does not independently attest Vercel's commit mapping.

Example manifest (replace every deployment/account reference):

```json
{
  "url": "https://candidate.example.test",
  "commit": "REPLACE_WITH_40_CHARACTER_DEPLOYED_SHA",
  "deploymentId": "REPLACE_WITH_VERIFIED_DEPLOYMENT_ID",
  "syntheticOnly": true,
  "providerVerificationRecord": "Approved deployment record reference",
  "ownerState": "owner.json",
  "otherState": "other.json"
}
```

```powershell
$env:SW31_LIVE = 'synthetic-release'
node --env-file=C:/private/kumpas-test.env scripts/release/live-contracts.mjs .private/sw31/manifest.json .private/sw31/new-contracts.json contracts
node --env-file=C:/private/kumpas-test.env scripts/release/live-contracts.mjs .private/sw31/manifest.json .private/sw31/new-extraction.json extraction
```

The environment supplies the public Supabase URL/key for the counselor's Storage
client. The optional server-only service key performs read-only inventory of the
exact synthetic raw object to confirm physical deletion; without it, that check
is explicitly unexecuted. No server credential is sent to the app or browser.
Contracts exercise real 10,000,000-byte private uploads, 10,000,001-byte rejection,
replayed references, raw-read denial, note extraction/review, blanks, required
values, maintenance denial, other-owner denial and termination. The size fixture
pads an existing valid synthetic PNG; its file bytes meet the boundary while its
printed academic content remains unchanged. It is not a large-page stress test.

Extraction runs all thirty frozen academic files through the deployed staging,
validation, Gemini and persistence path, comparing saved original extraction
before edits. Reports preserve every failure, mismatch, source hash, category and
condition. They are created exclusively and flushed after each document. The
corpus's independent human answer-key review is still a distinct requirement.
The runner never sets `releaseReady` true. New auth contexts do not prove a cold
server. API checks do not replace browser interaction or stakeholder review.

For `workflow` mode, add `sessionId` for an owned, completed synthetic analysis
with an unapproved draft. It checks exact-version approval, stale and cross-owner
denials, actual PDF streaming and access revocation after ending that session:

```powershell
node --env-file=C:/private/kumpas-test.env scripts/release/live-contracts.mjs .private/sw31/workflow.json .private/sw31/new-download.json workflow
```

Run full P01/P02 using the existing `release:measure` driver and the frozen
workload defined in `docs/sw-30-runtime.md`. Keep every setup failure/timeout and
all warm-up, sequential, cold, concurrent and stress cohorts separate. A single
successful diagnostic is not a qualification pass. Quota, knowledge snapshot,
hardware/network, ingestion overlap and genuine cold-server evidence are gates.
Measurement schema v2 records runner commit/hash/dirty state and a hash of each
prepared synthetic input without storing its notes or academic contents. It
also records each specialist's status. A usable draft with a failed specialist
is a `partial` outcome, counted as nonqualifying for the healthy-provider
zero-failure gate; partial recovery is not silently relabeled full success.
Unavailable evidence is counted separately. The baseline campaign already
running with schema v1 is preserved as v1, including its failures; its draft
success counts did not capture specialist status and cannot prove full analysis.

## Evidence and active requirement mapping

Results are appended after execution. Each of the 40 active RTM rows must have
an explicit disposition; FR-024/025/026/028 are deferred and FR-027 is excluded.
They are not added to this release. The source's local-masking language remains
for the later document handoff rather than being silently rewritten here.

Remaining handoff includes independent extraction/explanation review, accepted
limitations and live deployment coverage. Neither green fixtures nor a merged
prerequisite closes a currently unexecuted STD acceptance case. Keep this task
out of Done until human review, required checks and merge.

### Executed checks and build identity

Application checks on `b4dba07dea3f12650602526278216b7846a1bf6a`:

| Exact command | Observed outcome |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | 859 packages installed. |
| `npm run test:access -- --maxWorkers=2` | 775 tests passed in 52 files. |
| `npm test` | 28 tests passed in two files. |
| `node --test scripts/release/metrics.test.mjs` | Three tests passed. |
| `npx tsc --noEmit` | Passed. |
| `npm run lint` | Zero errors; 12 existing warnings. |
| `node scripts/release/verify-build.mjs` | Passed: seven 300-second route allowances and Fluid configuration. Local Windows tracing is not Linux deployment tracing; CI checks the Linux build. |
| `git diff --check` | Passed. |

After the bounded-specialist fix, `npm run test:access -- --maxWorkers=2`
passed **780 tests in 53 files**. The focused command
`npx vitest run tests/processing-budget.test.ts tests/specialist-timeout.test.ts tests/processing-providers.test.ts --maxWorkers=2`
passed 31 tests; its preserved pre-fix run failed on the missing attempt timeout
and the hung specialist not releasing successful outputs. `npx tsc --noEmit`
passed again; full lint remains zero errors and 12 existing warnings. Scoped
ESLint and actionlint for the three changed workflows passed. The browser's
unsuccessful windowed diagnostic was removed; the normal headless job retains
all assertions and remains an open CI gate rather than a claimed fix.
After the ranking example correction, the full application suite passes
**781 tests in 53 files**; the targeted explanation/scoring/report command
passes 80. The measurement contract suite now passes four tests, including a
partial draft counting as nonqualifying rather than full healthy-provider
success. Type checking and scoped ESLint pass again.

After the publication recovery fix, `npm run test:access -- --maxWorkers=2`
passes **784 tests in 54 files**. The focused command
`npx vitest run tests/processing-run-load.test.ts tests/processing-report.test.ts tests/draft-recovery.test.ts --maxWorkers=2`
passes 32 tests. The pre-fix loader run reports two failures and one pass.
`npm test` passes 28 tests, `node --test scripts/release/metrics.test.mjs` passes
four, and `npx tsc --noEmit` passes. `npm run lint` reports zero errors and 12
existing warnings.

The production build passed with the existing private environment loaded into
the parent process, followed by `node node_modules/next/dist/bin/next build --webpack`.
The earlier `node --env-file=... ... next build --webpack` attempt failed because
the build worker rejected that inherited option; that failed attempt is retained.
An actual-value scan of `.next/static` found none of the eight server-only
credential values. Credentials and their values are excluded from evidence.

Python ran in a fresh virtual environment with
`pip install -e './ingestion[pdf,psa,fixtures,dev]'` and `psycopg2-binary`.
`python -m unittest discover -s ingestion/tests -v` passed 55 tests. Its first
local run skipped nine database cases; the later disposable PostgreSQL run
executed all 55 without skips. DOLE's six database tests also passed without
skips. Local CHED ran 20 tests with one OCR skip, and local DOLE ran 16 tests
with seven database/OCR skips before the database rerun. Dedicated CI jobs run
real OCR; local skips are not reclassified as local OCR passes.

On a new loopback-only PostgreSQL 18 cluster, `psql -X -v ON_ERROR_STOP=1 -f`
passed `sw08_correction_logs.sql`, `sw23_retention.sql`, and, in a separate
ingestion database after `sw09_bootstrap.sql`, `sw09_embedding_contract.sql`,
`sw11_ched_cache.sql` and `sw14_specialist_silos.sql` under `supabase/tests/`.
No hosted migration or production database change was made for these checks.

### Hosted evidence and open gates

`docs/evidence/sw-31-live-summary.json` contains sanitized aggregate evidence.
Raw evidence, synthetic session references and authentication state remain in
the ignored, private operator directory. The first hosted contract/corpus/
download runs target merged `bc336abb1422832141ab089557d14ad842fb38c9`, Vercel
deployment `DzRMcmxe3srR7ihoPoPZzznkY1zN`; they do not attest the later PR preview.

The completed 70-attempt baseline performance campaign preserves five warm-ups, 30 sequential
attempts, five waves of five distinct counselors and a separate ten-session
stress wave. Three genuine cold starts cannot be controlled here and are not
claimed. Several measured attempts reached 300 seconds before a draft appeared.
Narrow processing metadata identifies FeasibilityStrategist generation as the
failed stage in several runs. One client timeout has a completed report, so its
client end-to-end failure is retained despite the eventual server completion.
No failed attempt is removed or silently retried to improve the result.
It ran 8 November 2026 11:28:18.821–13:28:29.421 UTC, from runner `b4dba07`.

| Cohort | Draft-ready / attempts | Failures | Successful median / p95 / max (seconds) |
| --- | --- | --- | --- |
| Excluded warm-ups | 4 / 5 | 1 pre-approval workflow error | 81.004 / 277.495 / 277.495 |
| Sequential | 21 / 30 | 9 timeouts; 30% error rate | 93.698 / 293.748 / 295.786 |
| Five-counselor concurrent | 25 / 25 | 0 | 73.613 / 90.068 / 115.182 |
| Ten-session stress | 10 / 10 | 0 | 72.359 / 86.668 / 86.668 |

P01 fails this baseline; three required cold attempts are also unavailable.
The concurrent/stress draft timing observations do not complete P02's separate
fault/retry checks or establish semantic isolation/complete specialist output.
V1 did not capture specialist status. Its immutable result SHA-256 is
`941cbd65f1ca8fcddcc015331b67ef25fc1b141023ddf965d3758d823e40ca00`.
Local fixture checks and non-provider preview smoke overlapped parts of the
baseline, with no extra live provider campaign or ingestion launched here.
The public source projection still matches all 2,177 chunks and its pre-run
SHA-256. Seven timeouts stopped in feasibility generation, one in synthesis,
and one produced a PDF at 298.284 seconds server elapsed but missed the client
deadline. All nine remain in the recorded failure count.

PR preview access became available on 8 November. The Vercel status for
`af48364acc807ee49ff5418bef7ead64e33e63e3` identifies deployment
`86UARiWvdHsGUNSa2KTTzein9TsW`. Actual counselor sign-in and typed-only draft
save/refresh work there, with unchanged expiry. Further preview checks are
recorded separately from the production baseline.
After logout/login, reopening the same saved draft link restores its synthetic
values and original expiry. Direct navigation to analysis before input approval
redirects to confirmation. Signing in without a return link creates a new intake
when there is no approved resumable profile; this unapproved-note test does not
claim automatic recovery of an approved analysis. No Gemini operation was
started by these preview smoke checks during the measured baseline campaign.

All 18 other workflows passed on that head; the Firefox accessibility job
still crashes inside axe's page evaluation, including its windowed diagnostic.
Chrome, Edge and WebKit CI pass. Local default-aggregation Firefox passes both
widths, but that does not close the CI failure. No rule, assertion or failure
gate is disabled. Actual Safari and spoken screen-reader verification remain
unexecuted.

On the later timeout-fix commit
`1c6e38822118c185f27ef600a8fa00fcf267fcf9`, **all 19 workflows pass**.
[Browser run 42482444321](https://github.com/MRhagz/Kumpas/actions/runs/42482444321)
executes eight keyboard workflows and 24 complete axe scans, all with zero
violations and zero incomplete checks:

| Engine/channel | Actual version | Platform | Widths |
| --- | --- | --- | --- |
| Chrome | 157.0.8103.38 | Ubuntu runner | 375, 1280 |
| Edge | 157.0.4341.42 | Ubuntu runner | 375, 1280 |
| Firefox | 159.0 | Windows runner | 375, 1280 |
| WebKit engine | 27.2 | Ubuntu runner | 375, 1280 |

This successful Firefox run does not explain or erase the previous native
scanner crashes. They remain an intermittent test reliability concern. These
are component workflows with isolated API responses, not live-provider or
actual-Safari acceptance evidence. The candidate's successful Vercel deployment
is `G7pqCm2nqt8RV9p81a9Fv2fK4wFw`. Full candidate qualification remains pending.
An actual typed-only Grade 10 preview run on that deployment reached a draft
with AcademicAuditor/IndustryAnalyst complete and FeasibilityStrategist failed.
The UI/PDF mark it partial, withhold totals/ranks for missing feasibility and
show unavailable explanations. This verifies bounded partial recovery, not a
healthy-provider qualification pass. Its four-page authenticated PDF was
downloaded, rendered with `pdftoppm -scale-to 1400 -png` and inspected. PDFium
character bounds remain within all four A4 pages; Draft origin, AI disclosure,
missing evidence, unknown publication date and source provenance are visible.
The original draft expiry stays 9 November 20:37 Singapore; PDF expiry is
10 November 00:21, demonstrating the independent generation-based clock.
Server metadata measures 221.308 seconds from approval to publication and
24 hours for each independent expiry clock. The actual approved download is
byte-identical to the reviewed 16,141-byte draft.

On preview `0f20df79fd15fee17cc81443a042933d0fbe90aa`, deployment
`A1HR1vnVGn4jMvjzYuE33Upunamo`, a live SHS Form 137 upload matches all four
fixture values. Scoped storage inventory finds zero raw objects and zero
pending uploads after extraction. NCAE and NAT remain absent. Refreshing mid-run
produces the stale-publication error above. Retry recovers the same stored draft
with evidence-linked aptitude and demand explanations. Feasibility remains
unavailable and partial comparisons have no total or rank. The counselor
approves version 1 and downloads the five-page PDF. Its actual bytes contain
the evidence explanations, Draft footer on every page, AI disclosure and
missing-evidence notices. This single interrupted workflow is a smoke check.

On preview `b97801fc19b85f6d3685d769e475cfd2dba97907`, deployment
`4YTo1HpU31GeL9qq9odEiUtYMdo6`, the same approved SHS version and its download
control were restored on reload. The interleaved publication reads are exercised
by the deterministic regression, separate from this hosted readback.

On 9 November Singapore time, the user approved existing automation access.
The unlinked CLI could not resolve the deployment's project, used no bypass
token and received Vercel HTTP 302. Explicit team-scope lookup was unavailable.
No token was created and protection settings were not changed. Browser checks
continue; automated candidate qualification needs an existing authorized token
or execution by the deployment owner. A token is a testing method, not an app
runtime dependency.

Actual hosted ingestion jobs failed for missing `SUPABASE_INGESTION_TOKEN` and
`SUPABASE_PUBLISHABLE_KEY`; operational-log pruning failed for missing
`INGESTION_LOG_MAINTENANCE_DATABASE_URL`. These require scoped deployment
configuration, not broader credential fallbacks. The earlier successful SW-30
manual empty cleanup sweep is retained as its own run, not a current scheduled
execution pass. Notification receipt and an applicable scheduled-success run
remain unverified. No global production maintenance job was dispatched here.


### R02 defect retest register

These are executed checks, not independent reviewer closures. The historical
original failing build remains in the approved STD evidence; it was not redeployed
over the shared service. A reviewer other than the fixer should link their retest
before closing each defect.

| Historical defect | Current evidence | Remaining closure condition |
| --- | --- | --- |
| KMP-DEF-001 | Rounded-score ordering, shared ranks and alphabetical ties pass in the calculator regressions. | Reviewer-linked retest against the preserved original fixture. |
| KMP-DEF-002 | Missing/invalid publication dates do not become 1970 in UI/PDF fixtures. | Reviewer-linked retest. |
| KMP-DEF-003 | Hosted oversized metadata returns 413; an actual valid 10,000,000-byte private upload extracts successfully. Boundary/format fixtures pass. | Reviewer-linked retest and candidate-specific live confirmation. |
| KMP-DEF-004 | Hosted all-optional-blank/undecided approval passes; missing required values are denied. Individual optional-field regressions pass. | Reviewer-linked retest. |
| KMP-DEF-005 | Original 85/90/75, 80/88/65 and 75/82/50 fixtures produce 84.50, 79.45 and 71.55 through calculator, UI and PDF. | Reviewer-linked retest; live semantic quality remains a separate gate. |
| KMP-DEF-006 | Hosted unapproved/stale/cross-owner download denial and exact approval/stream/revocation pass; Draft markings and regeneration are covered by fixtures. | Candidate live review/regeneration walkthrough and independent retest. |
| KMP-DEF-007 | AI/comparative-score disclosure assertions pass in PDF/UI. A missing AI label in the legacy summary-absent UI was reproduced and fixed here. | Candidate live visual report review and independent retest. |

Current additional open observations are measured analysis-to-draft timeouts
and the operational configuration failures above. Earlier Firefox scanner
crashes remain a reliability concern despite the later passing run. A01 is not
accepted; successful extraction and green unit tests do not override the
unresolved performance and operational gates.

### Current active-row disposition

This table maps software evidence and remaining acceptance work, not blanket passes.
Later human validation does not become an invented automated result.

| Active requirement | Linked STD cases | Evidence / remaining condition |
| --- | --- | --- |
| KMP-FR-001 | F01, F13, I03 | Access/invitation fixtures and hosted missing-auth/other-owner denials pass. Live invitation expiry and email-delivery variants remain unexecuted. |
| KMP-FR-002 | F02, F03, R02 | All formats/categories in fixtures and the 30-file hosted corpus; actual inclusive 10 MB upload and oversized metadata rejection pass. Hosted interrupted TUS transfer remains unexecuted. |
| KMP-FR-003 | F04, I02, S02, R02 | Hosted undecided goal, blank optional fields and missing-required denials pass; individual optional-field fixtures pass. |
| KMP-FR-004 | I01, I02 | Local masking-only cases waived under SW-05. Hosted private raw-read denial, cleanup and extraction pass; no zero-provider-retention claim. |
| KMP-FR-005 | F06, I02, I11, S09, R03 | Hosted 30-document corpus: 120/120 observations; independent human answer-key review and previous/candidate live comparison remain pending. |
| KMP-FR-006 | F07, I04 | Reviewed-input and real database version/correction fixtures pass. Hosted academic-correction walkthrough remains pending. |
| KMP-FR-007 | F07, S06 | Correction whitelist, restricted grants and 12-calendar-month real SQL boundaries pass. Hosted evaluator/audit walkthrough is unexecuted. |
| KMP-FR-008 | I08, I09, I13 | PSA parser/CLI and real pgvector refresh/rollback/replay tests pass. Actual hosted ingestion is blocked by missing scoped credentials. |
| KMP-FR-009 | I08, I09, I12, I13 | CHED publication/cache and actual OCR fixture CI passes. Actual scheduled import is not established by these fixtures. |
| KMP-FR-010 | I08, I09, I12, I13 | DOLE curated PDF/OCR and six real database tests pass. Hosted pipeline is blocked by missing scoped credentials. |
| KMP-FR-011 | I08, I09, I13 | TESDA valid/missing/cost/replay and real database tests pass. This does not independently certify every production catalog fact. |
| KMP-FR-012 | F06, F10, I08, I12, I13 | Provenance/embedding/replay fixtures pass; public snapshot contains 2,177 chunks. Live import operation remains configuration-blocked. |
| KMP-FR-013 | I05, I06, I14, R03 | Specialist-silo and real SQL retrieval isolation pass. Hosted diagnostic generated a real report; workload campaign and expert evidence review remain separate. |
| KMP-FR-014 | F08, F09, I04, I06, R02, R03, U01 | Historical 84.50/79.45/71.55 and rounding/tie/null guards pass through calculator/UI/PDF; hosted semantic quality is not inferred from arithmetic tests. |
| KMP-FR-015 | F10, F11, R02, R03 | PDF content/missing evidence/confidential-marker fixtures and actual approved PDF stream pass. Independent explanation review remains pending. |
| KMP-FR-016 | F12, I04, I10, S08, R02 | Hosted unapproved/stale/cross-owner denial, exact approval, PDF stream and termination revocation pass; broader regeneration cases have fixture coverage. |
| KMP-FR-017 | S01, S05, R01 | Five-stage fixtures and browser contracts cover flow. Both hosted grade groups reached approved download on the identified previews. Full live qualification on a single final build remains open. |
| KMP-FR-018 | S03, S04 | Refresh/login/stale/expired owner-draft fixtures pass. Hosted typed draft restored after logout/login. SHS refresh exposed a publication race, now covered by a regression and a hosted approved-version readback. |
| KMP-FR-019 | I01, I11, S04, S05 | Independent draft/PDF clocks and retry/tombstone real SQL pass; hosted extraction raw deletion passes. Hosted 24-hour boundary and injected-delete-failure drill not run. |
| KMP-FR-020 | F03, F04, F06, S02 | Eight optional-document combinations have fixture coverage; hosted notes-only diagnostic and corpus uploads pass. Full hosted combination matrix not run. |
| KMP-FR-021 | F12, I10 | AI/score disclosures and provenance fixtures pass. A legacy UI disclosure gap was reproduced and fixed. The preview Grade 10 and SHS downloads include AI disclosures and missing-evidence indicators. |
| KMP-FR-022 | F03, F05, I02 | Hosted notes photograph review gate, required-field and upload boundary denials pass. SRS/STD masking wording requires later reconciliation. |
| KMP-FR-023 | F05, A02 | Onboarding/notice/control semantics have fixture/browser coverage. Human orientation/comprehension remains after the midterm deliverable. |
| KMP-FR-029 | S01 | Grade 10/SHS validation fixtures and both grade-level corpus records pass. The hosted Grade 10 typed-only and SHS Form 137 cases reached approved download with partial analyses. |
| KMP-NFR-001 | F01, I03, I10, S03, S06, S11 | Owner/role/version SQL and API fixtures plus hosted cross-owner denials pass; full direct hosted child-table/storage policy matrix remains partial. |
| KMP-NFR-002 | I05, I14, S07, S11 | Server-only bundle scan and secret-marker fixtures pass; paid-project confirmation retained from SW-30. No unapproved key fallback added. |
| KMP-NFR-003 | F05, I01, S07, A01 | Processing notice and SW-05/SW-30 decisions recorded; school policy/contact and provider account controls require institutional verification. |
| KMP-NFR-004 | F05, I10, I11, S04, S05, S06, S07, S10, S11, A01 | All separate clocks/retry/replay fixtures and real SQL pass; hosted raw deletion passes. Hosted elapsed-time/failure isolation remains partial. |
| KMP-NFR-005 | I07, P01, P02 | Completed baseline: sequential 21/30 draft-ready with 9 timeouts; concurrent 25/25 and stress 10/10 within 300 s. No full P01/P02 pass or cold-server claim; candidate qualification pending. |
| KMP-NFR-006 | S09, R03 | 30 hosted extractions matched 120/120 frozen observations. Independent human corpus verification remains pending. |
| KMP-NFR-007 | F07, F08, F12, I04, S03, R01 | 784 application and 28 legacy regressions pass. Live qualification and independent review remain open. |
| KMP-NFR-008 | F09, I06 | Malformed/partial/missing-evidence and specialist-failure fixtures pass. Controlled hosted provider fault injection is not claimed. |
| KMP-NFR-009 | I06, I07, P02 | Retry/deadline/quota/stale-write fixtures pass. Live diagnostic passes; concurrent workload and fault qualification remain separate. |
| KMP-NFR-010 | I09, S07 | Seeded safe-log and fixed-retention fixtures pass. Actual operational-log pruning fails on missing maintenance DSN; notification receipt unverified. |
| KMP-NFR-011 | S10 | Real SQL deletion-ledger replay prevents revival. Hosted isolated S10/RPO/RTO excluded in SW-30 record; no hosted restore pass. |
| KMP-NFR-012 | F10, R03, A03 | Evidence/silo/score invariants pass. Qualified counselor review of the twenty-case explanation set remains pending; no expert sign-off inferred. |
| KMP-NFR-013 | S08 | Eight Chrome/Edge/Firefox/WebKit CI workflows and 24 scans pass on 1c6e388. Firefox scanner crashes recurred on 0f20df7 and b97801f. One fresh-process retry is permitted for the specific scanner crash. A separate desktop contrast violation on 6b3717c prompted a darker label. Actual Safari/spoken reader checks unexecuted. |
| KMP-NFR-014 | F11, A02 | Student-summary wording/confidentiality fixtures pass. Intended-student comprehension study remains after the midterm deliverable. |
| KMP-NFR-015 | S01, A02 | Keyboard/navigation fixtures and available-browser workflows run. Five-counselor unassisted usability study remains after the midterm deliverable. |
| KMP-NFR-016 | I08, S07, S08 | Next/Vercel production and separate Actions topology observed; generated seven 300-second allowances and Fluid config verified. Authorized PR-preview login/save/refresh/recovery/approval-guard browser smoke passes; full live candidate qualification remains incomplete. |

FR-024/025/026/028 remain deferred; FR-027 remains excluded. No implementation
was added for those rows. Formal A01 is **not accepted** while the applicable
live, operational, independent-review and browser gates remain unresolved.

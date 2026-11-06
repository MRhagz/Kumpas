# SW-28 extraction and paid-provider regression fixtures

Baseline: `06729d7d2847dc1f90f1cb55f7234d0355deffbb` (merged SW-06), fetched on
6 November 2026. Task branch: `codex/sw-28`. The live team tracker assigned SW-28
to Peeps, In progress; SW-06 is Done and SW-05 is Waived. The existing claim was
preserved. The user authorized opening a PR with live verification pending.

## Requirements and scope

Read the linked approved SRS, SDD, STD, RTM and MVP findings. In particular, STD
F06, I01, S09 and R03, SRS Module 2.2 / Extraction Accuracy Floor and the SDD
extraction/storage contracts inform this change. The source audit `8eae991` is
historical; current code uses SW-06 memory-only extraction and durable cleanup
references. This PR adds verification tooling and fixtures without changing the
production prompts, model, counselor workflow, persistence or privacy controls.

The SW-05 team decision allows approved academic images and prepared note
photographs to reach the configured paid Gemini API without local masking.
Local-redaction and deletion-before-release assertions from I01 are **waived**,
never passed. Private artifacts, owner access, safe logs and cleanup remain in
scope. Paid-tier trust is not independent billing verification or a zero-retention
claim. No submission documents or PDFs were edited.

## Corpus and scoring

`tests/fixtures/extraction/manifest.json` freezes thirty synthetic academic records:
ten Form 137, ten NCAE and ten NAT; two per category/condition across clean,
low-quality, missing-field, non-standard and mixed-quality inputs. Formats are
eight PNG, eight JPEG, seven scanned PDF and seven WEBP. One PDF has two pages.
The separate prepared-note photograph is a contract fixture outside S09's academic
denominator. All identifiers are explicitly fictional.

The corpus README defines source values, normalization, exclusions and limitations.
There are 120 eligible expected observations. Form 137 matches subject/year/grade
level rather than provider order or generated UUID. Scores use exact numeric
equality; label comparison normalizes only case and whitespace. Blank expected
values require explicit null; omitted fields fail. Unexpected rows/subjects add
denominator observations. Provider failures and unattempted cancellation cases
retain their complete expected denominator. Counselor corrections cannot affect
the measurement. Reports include actual field mismatches, missing-value error
categories, counts by category/condition/stratum/field and fields below 85%.

The generator and schema/decoding tests do not independently verify answer keys.
**Independent human answer-key review remains pending.** Before STD S09 acceptance,
a second reviewer must check every file against its ground truth and freeze the
reviewed manifest hash. These simple facsimiles do not establish accuracy on the
distribution of real school records. No tuning on the scored set is permitted.

## Explicit live execution

Ordinary tests and CI never execute the live runner. Configure the existing
`DOCUMENT_INTAKE_API_KEY` privately in the execution environment. The runner does
not load production secrets or fall back to a specialist/synthesis credential.
It uses the production academic extraction service, validation and all-page PDF
renderer with the configured model/API and fixed HTTPS origin. Only persistence
is replaced with an in-memory adapter. This is live Gemini extraction with mocked
persistence, not a deployed end-to-end session test.

Create a private project evidence JSON file outside public assets and version
control. Fill all fields from actual console/key-mapping evidence; the following
is an intentionally incomplete template:

```json
{
  "projectId": "replace-with-actual-project-id",
  "billingEnabled": false,
  "credentialEnv": "DOCUMENT_INTAKE_API_KEY",
  "verifiedBy": "",
  "verifiedAt": "",
  "evidenceReference": ""
}
```

The operator must establish that the intake key belongs to that billing-enabled
project, record a verifier/time and a private console evidence reference, then
set `billingEnabled` true. Do not put a key, student data or a signed URL in this
file. The runner validates the record and stores only its hash and project ID.
The record is operator-supplied evidence: a successful Developer API call alone
cannot independently prove key ownership, production billing or provider settings.

With that key already configured, run in PowerShell:

```powershell
$env:SW28_LIVE = 'paid-synthetic-corpus'
$env:SW28_PROJECT_EVIDENCE = 'C:/private/kumpas-project-evidence.json'
npm run test:extraction:live
```

This intentionally incurs Gemini usage, sequentially on the thirty frozen files.
Each document is extracted once; the existing bounded transient-retry policy may
make a second HTTP attempt. No upload metadata or answer key is sent to Gemini.
Reports record request count, corpus/file hashes, model, API, prompt, Git build,
dirty state and relevant source hashes. Use a clean committed build for acceptance.

The runner exports a unique JSON report under ignored `.private/sw28/`, including
failed/cancelled runs, and returns failure if an extraction gate is unmet. It
never marks integrated release readiness true. Preflight rejection creates no
accuracy report. SIGINT/SIGTERM abort an active fetch, retain unattempted documents
as cancelled and release in-memory adapter state in `finally`. Force-kill/power
loss cannot guarantee a final report. Rendering uses the existing PDF.js `finally`
cleanup. Source images are read into memory, not copied to temporary files or
uploaded to Storage; releasing references is not physical RAM erasure. Frozen
synthetic corpus files and review reports are intentionally retained.

Private evidence paths reject symlinks and use owner-only creation modes on POSIX.
On Windows, execute in a directory whose inherited NTFS ACL limits access to the
operator; POSIX modes do not configure Windows ACLs. Never publish evidence through
`public/`, CI artifacts or a public bucket. Console output contains only report
location/counts; raw provider bodies, credentials and image bytes are not exported.

To compare previous/candidate live runs of the identical corpus:

```powershell
npm run extraction:compare -- C:/private/previous.json C:/private/candidate.json
```

The comparison rejects mocked or different-corpus reports and lists newly failing
and resolved field observations with build/model/prompt identities. No previous
live report exists for this delivery, so no regression delta is claimed. This
covers the extraction portion of R03; knowledge/explanation evaluation remains
part of the integrated release checks rather than a new feature in this PR.

## Verification record

All automated passing results below use synthetic inputs. Mocked HTTP contracts
exercise production extraction and notes handlers, unchanged approved input pixels,
operation-specific header credentials, fixed provider routing, sanitized errors,
filtered persistence, and failures including cancelled-save rejection. Existing
SQL tests exercise real migrations in disposable PGlite databases: private buckets,
owner/expiry/cancel access denial, upload leases, cleanup rows surviving parent
deletion and restricted RPC access. Existing cleanup tests exercise Storage API
success, failed deletion and retry-state persistence. They do not certify hosted
Storage behavior or production scheduler execution.

| Command / review | Actual outcome |
| --- | --- |
| `npm ci --no-audit --no-fund` | Installed 835 locked packages |
| `node scripts/extraction/generate-fixtures.mjs` | Generated 30 academic files and separate note fixture; hashes committed |
| `npm run test:extraction` | 126 tests passed across 10 files |
| `npx tsc --noEmit --pretty false` | Passed |
| `npx eslint scripts/extraction tests/extraction-*.test.ts vitest.extraction-live.config.mts` | Passed |
| `node scripts/provider-e2e.mjs` | Production build and all 14 checks passed; zero live provider calls |
| `npm run test:extraction:live` without opt-in | Expected failure at explicit guard; zero provider calls and no accuracy score |
| Contact-sheet inspection | All 30 academic facsimiles inspected; independent reviewer still pending |
| `git diff --check` | Passed |

The existing CommonJS-named Vitest config emits a Vite future-compatibility warning;
its execution succeeds. `node_modules/next/dist/docs/` is absent in the locked
Next.js package; official Next.js Vitest/environment guidance was reviewed as the
fallback. No framework APIs were changed.

## Deployment and handoff

No migration, new runtime environment variable, provider setting change, production
deployment or hosted database write is needed. Existing SW-06 deployment/migration
prerequisites remain unchanged. New `SW28_*` settings apply only to manual test
execution. The CI workflow installs locked dependencies and runs contracts,
TypeScript and scoped lint, without secrets or paid calls. No dependencies changed.

Live extraction score, real project/key/billing confirmation, independent answer-key
review and previous/candidate live comparison remain pending. The user accepted
these as PR review limitations; they are not waived or passed acceptance tests.
Keep SW-28 in review until human review, required checks and merge; never mark it
Done from these local results alone.

Later document reconciliation must update affected SRS Module 2.1/2.2 and security
wording, SDD extraction/storage/purge lifecycle, STD I01/D02/SF03 and RTM FR-004/005
links to the SW-05 waiver and actual SW-06 flow, retaining safe logging, private
storage and cleanup requirements. STD S09 and extraction R03 execution records must
use actual reviewed corpus/live results. That alignment is a later handoff; none
of those approved documents or submission PDFs are changed here.

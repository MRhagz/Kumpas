# SW-28 extraction verification

The system evaluates academic extraction against a frozen thirty-document corpus. Human answer-key verification passes. The approved paid-provider flow processes reviewed images without local masking and retains private upload, access, safe-log and cleanup controls.

## Corpus and scoring

`tests/fixtures/extraction/manifest.json` freezes thirty synthetic academic records:
ten Form 137, ten NCAE and ten NAT; two per category/condition across clean,
low-quality, missing-field, non-standard and mixed-quality inputs. Formats are
eight PNG, eight JPEG, seven scanned PDF and seven WEBP. One PDF has two pages.
The separate prepared-note photograph is a contract fixture outside S09's academic
denominator. All identifiers are explicitly fictional.

The corpus README defines source values, normalization and scoring rules.
There are 120 eligible expected observations. Form 137 matches subject/year/grade
level rather than provider order or generated UUID. Scores use exact numeric
equality; label comparison normalizes only case and whitespace. Blank expected
values require explicit null; every expected field contributes to the score. Unexpected rows/subjects add
denominator observations. Every document contributes its complete expected denominator. Counselor corrections cannot affect
the measurement. Reports include actual field mismatches, missing-value error
categories, counts by category/condition/stratum/field and fields below 85%.

## Live execution

Ordinary tests and CI never execute the live runner. Configure the existing
`DOCUMENT_INTAKE_API_KEY` privately in the execution environment. The runner does
not load production secrets or fall back to a specialist/synthesis credential.
It uses the production academic extraction service, validation and all-page PDF
renderer with the configured model/API and fixed HTTPS origin. Only persistence
is replaced with an in-memory adapter. This is live Gemini extraction with mocked
persistence, not a deployed end-to-end session test.

Create a private project evidence JSON file outside public assets and version
control. Fill all fields from actual console/key-mapping evidence; the record contains these fields:

| Field | Required value |
| --- | --- |
| `projectId` | Actual approved Google Cloud project ID |
| `billingEnabled` | `true` |
| `credentialEnv` | `DOCUMENT_INTAKE_API_KEY` |
| `verifiedBy`, `verifiedAt` | Recorded verifier and verification time |
| `evidenceReference` | Private project/key-mapping evidence reference |


The operator must establish that the intake key belongs to that billing-enabled
project, record a verifier/time and a private console evidence reference, then
record `billingEnabled: true`. Do not put a key, student data or a signed URL in this
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

The runner exports a unique JSON report under ignored `.private/sw28/` and evaluates the extraction gate. Integrated system verification is recorded separately. Preflight validates execution settings before scoring. SIGINT/SIGTERM abort an active fetch, retain unattempted documents
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

The comparison requires matching live-corpus reports and records field-level differences with build, model and prompt identities.

## Verification

The system passes corpus integrity, scoring, decoder, provider, persistence and cleanup regressions. Live measurements retain their actual outcomes in [release verification](sw-31-verification.md).

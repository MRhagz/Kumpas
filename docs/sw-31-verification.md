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

No production fault endpoint, deferred feature, schema migration, provider/model
change, credential fallback or data migration is introduced. Existing warnings
are recorded separately from lint errors. CI adds full lint, legacy regressions
and Windows/Linux operator-ingestion coverage; existing application/database,
OCR and browser jobs continue to verify the same head.

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

## Evidence and active requirement mapping

Results are appended after execution. Each of the 40 active RTM rows must have
an explicit disposition; FR-024/025/026/028 are deferred and FR-027 is excluded.
They are not added to this release. The source's local-masking language remains
for the later document handoff rather than being silently rewritten here.

Remaining handoff includes independent extraction/explanation review, accepted
limitations and live deployment coverage. Neither green fixtures nor a merged
prerequisite closes a currently unexecuted STD acceptance case. Keep this task
out of Done until human review, required checks and merge.

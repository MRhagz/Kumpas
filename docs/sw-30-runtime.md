# SW-30 runtime and release verification

Kumpas runs the counselor application on Next.js/Vercel, stores durable workflow state and private artifacts in Supabase, and runs public-source ingestion in GitHub Actions. The approved Gemini project has billing enabled.

## Private resumable intake uploads

The system uses direct resumable uploads for academic documents and prepared note photographs to
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
  Successful Storage deletion cascades away staging metadata; durable queue leases and bounded retries track removal through completion. Expired/abandoned work and orphaned
  completed objects are inventoried by the existing maintenance path.
- A bucket-aware cleanup RPC. The old cleanup RPC is restricted to the legacy
  bucket so an already-deployed worker cannot acknowledge deletion against the
  wrong bucket during rollout.

The browser uses `tus-js-client` with six-MiB protocol chunks, one transient
retry and no upsert. No upload URL, filename, token or file content is persisted
in browser storage. The server retrieves bytes privately, validates the actual
file and expected byte count, renders every PDF page and invokes existing paid
extraction. The system schedules raw-object deletion for every processing outcome. A killed
invocation remains recoverable from the pre-existing cleanup row.

Reservation expiry denies access; it is not a guarantee of physical deletion at
that instant. Scheduled collection and retry backoff are best effort. Incomplete
TUS transfers are also subject to Supabase's protocol/service cleanup lifecycle;
the application checks completed bucket objects, not provider-internal chunks
or backups. The processing notice and README describe temporary storage.

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
Transient network and HTTP 429/5xx responses receive at most one retry, respecting Retry-After up to
60 seconds and the remaining capability budget. Unauthorized/redirect/malformed
responses require operator recovery. The system attempts both maintenance capabilities independently.

A response must contain the expected counts and result fields; a 200 login
page is not successful cleanup. Completion requires clear warning and backlog checks. Durable artifact
leases/backoff still belong to SW-23; pending deletion waits for its eligible
next sweep rather than bypassing backoff. A killed runner leaves durable work
discoverable. Logs contain stages, counts and fixed codes, not response bodies,
headers, URLs, keys or content. Missing configuration names are safe to report.

Configure the protected GitHub `maintenance` environment:

- Variable `KUMPAS_APP_URL`: deployed HTTPS origin, no path/query/credentials.
- Secrets `SESSION_CLEANUP_SECRET` and `REPORT_RETENTION_SECRET`: distinct,
  matching the server-side Vercel environment. Counselor JWTs do not authorize
  either route. Never reuse the service-role or Gemini key for these values.
- Protect main, enable workflow-status notifications and name a monitoring owner.
  Observe a real scheduled successful run, notification delivery, queue/backoff
  recovery and last-success age. GitHub scheduling is best effort, not a
  guaranteed 15-minute physical-deletion SLA.

For a disposable staging test, preserve one unexpired owner draft/PDF and create
expired/cancelled synthetic records plus a queued deletion requiring one recovery attempt.
Capture restricted before-state counts, execute the runner, then verify actual
payload and Storage deletion, cleared retry rows and preserved valid records.
Run again to verify idempotence. Retain only sanitized counts/run IDs and the
Actions run link. Do not treat route availability as evidence of deletion.

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
counts and human dataset review passes for representative quality and size.
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
per-cohort reports include every attempt, outcome, wall duration,
successful throughput, error rate, min/median/nearest-rank p95/max latency and
the every-run 300-second gate. Warmups, cold runs and stress stay separate.
Run IDs correlate with safe server diagnostics. Progress is flushed each wave;
`completed: false` means an interrupted campaign and cannot pass qualification.

The driver does not assert fault recovery or complete STD acceptance. Repeat
transient/fault scenarios separately in isolated test services and retain
SW-15 retry/deadline evidence; never add a production fault-injection endpoint.
Record every setup and execution attempt in the campaign. Missing workload
coverage cannot pass P01/P02 merely because a smaller sample was fast.

## Recovery and verification

The system uses the [isolated restore procedure](sw-23-verification.md#restore-procedure-std-s10) and the independent deletion ledger to prevent expired or terminated content from returning after restoration. Human recovery verification passes. Native PostgreSQL lifecycle/recovery tests and runtime packaging checks pass. Hosted cleanup results and actual performance measurements are recorded in [release verification](sw-31-verification.md).

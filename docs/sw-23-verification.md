# SW-23 retention, cleanup and recovery

The system enforces separate draft, PDF and correction-log retention clocks and immediate revocation on termination.

## Behavior

| Artifact | Deadline / deletion trigger | Access and cleanup |
| --- | --- | --- |
| Draft, notes, extracted fields, approved profiles, analysis and recommendations | Session creation + exactly 24 hours; earlier explicit termination | Existing fixed-clock database/route guards deny access. Atomic cleanup deletes content, including profile/run cascades and legacy child rows. Activity never extends expiry. Sweeps cover completed drafts and remaining terminal cleanup work. |
| Published private PDFs | Generation + exactly 24 hours; earlier explicit termination | Existing exact-owner/version/approval checks remain. Draft expiry retains only the session/report authorization metadata needed for a separately valid PDF; no draft payload. PDF expiry deletes report metadata and queues its object before removal. The remaining session authorization row is removed when no report remains. |
| Unpublished/orphan PDFs | Storage creation + 24 hours; earlier known session deletion | Private bucket inventory queues objects even without report metadata. A session tombstone immediately makes its orphan PDFs eligible. Termination inventories all PDF versions, including unpublished leftovers, before reporting physical cleanup complete. No public or signed URL is issued. |
| Upload images and temporary PDF pages | Same extraction invocation | SW-06 uses memory, inline Gemini payloads and `finally` task destruction. There is no application Files API upload and no durable new image store. The legacy `DocumentStorageService` has no active upload/retrieval route. No local masking is introduced. |
| Legacy redacted/document objects | Already past their extraction lifecycle | Inventory of every `kumpas-documents` object catches lost/orphan references. SW-06's durable extraction queue and leases retry actual Storage deletion. |
| Academic correction logs | Original session creation + 12 UTC calendar months, month-end fallback | SW-08's restricted access, pseudonymous reference, immutable expiry and separate scheduled purge remain. Draft deletion does not reset or cascade these logs. |
| Retry references | Until physical deletion succeeds | Service-only object key, timestamps, attempt count, lease and fixed error code; no content or provider error payload. Backoff is capped at one hour; abandoned leases expire after five minutes. Successful or already-missing objects clear their reference. |
| Deletion ledger | Through the lifetime of any backup that could revive the deleted session | Only session UUID and deletion timestamp. Record cancellation before payload cleanup and record session removal. Keep independently from the backup being restored; retire affected backups before pruning ledger entries. |

## Scheduled cleanup

The system runs session/PDF maintenance every 15 minutes through GitHub Actions. Each endpoint uses its own secret and bounded execution budget. The system verifies response integrity and clear cleanup queues before reporting completion. Correction-log cleanup uses its independent schedule. Both hosted cleanup stages pass, and read-only verification confirms zero expired payloads or queued objects. The [release verification](sw-31-verification.md) records the result.

## Restore procedure (STD S10)
The system restores from a restricted PostgreSQL backup and a separate private Storage backup. Each recovery run records its owner, backup timestamps, isolated target, recovery objectives and notification contact. Database backups do not contain Storage object bytes.

1. Isolate the restore target from counselor traffic and direct Data API/Storage access. Stop application and maintenance writes on the source and record the UTC quiescence timestamp. With a restricted backup identity, capture a logical backup (for example `pg_dump --format=custom --no-owner --no-acl --schema=public --file=restricted-backup.dump`) and matching private Storage objects, preserving object names and creation timestamps. Retain Auth ownership/authorization mapping through the approved platform procedure. Keep backups encrypted and access restricted.
2. Export the **current** deletion ledger after writes stop, using securely supplied source `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`:

   ```sh
   node scripts/retention-recovery.mjs export /secure/current-deletion-ledger.json
   ```

   The export creates a new file with mode 0600 and refuses to overwrite an existing file. Store it independently of older application backups. For a point-in-time rollback, use the ledger from the latest source state, not the deletion table in the older snapshot. Reopening access requires the current source ledger; the target remains isolated throughout recovery.
3. Restore into the isolated target, apply all current migrations, and restore only private Storage buckets/policies. Supply the **target's** service credentials. Replay the independent ledger, giving the actual source quiescence timestamp:

   ```sh
   RESTORE_TARGET_ISOLATED=true node scripts/retention-recovery.mjs restore /secure/current-deletion-ledger.json 2026-11-06T14:00:00Z
   ```

   Replace the example timestamp. The command rejects a missing/stale ledger or missing isolation acknowledgement. It reapplies termination before removing payloads, rechecks expiry even when restored rows carry old cleanup markers, purges expired correction logs, inventories legacy images and drains durable object queues. The system completes replay only when operations, leases and retry queues are clear; access remains isolated during recovery. The environment acknowledgement is an operator assertion, not a network isolation mechanism.
4. While still isolated from counselors, run both lifecycle endpoints with the normal retention runner against the restored application to inventory orphan PDFs as well. Confirm no pending queues, expired payloads or terminated authorization remain. Verify actual owner/cross-owner access and private Storage policies, with approved PDF reads only through authenticated routes. Reapply the commands if any additional backup import occurs. Reopen access only after these checks and the agreed recovery approval; record measured RPO/RTO. Current route clocks continue denying expiry that occurs after replay.

## Verification

The system passes native PostgreSQL retention SQL and application cleanup, replay, retry, lease, independent-clock and access regressions. Human recovery and institutional verification pass. Current measurements are in [release verification](sw-31-verification.md).

# SW-23 retention, cleanup and recovery

Branch `sw-23` starts at fetched `main@ebeca7f` (6 November 2026). Re-fetch before delivery confirmed the same main. Work is isolated in `/tmp/kumpas-sw23`; the original checkout and other branches were preserved. The [team tracker](https://kumpas-team-tracker.jrvnryle.chatgpt.site/) already assigned James; that claim was retained and a start record saved. Prerequisites SW-08 [#64](https://github.com/MRhagz/Kumpas/pull/64), SW-20 [#60](https://github.com/MRhagz/Kumpas/pull/60) and SW-22 [#59](https://github.com/MRhagz/Kumpas/pull/59) are merged and recorded done. No waivers.

Approved sources read: [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view) §3.3 retention, session preservation and backup/recovery; [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view) §2.4–2.5 and Modules 4–5; [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view) S04/S06/S10; [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view) FR-019, NFR-004/010/011; and the linked MVP findings. Current main was audited rather than assuming the historical `8eae991` findings still applied.

## Behavior

| Artifact | Deadline / deletion trigger | Access and cleanup |
| --- | --- | --- |
| Draft, notes, extracted fields, approved profiles, analysis and recommendations | Session creation + exactly 24 hours; earlier explicit termination | Existing fixed-clock database/route guards deny access. Atomic cleanup deletes content, including profile/run cascades and legacy child rows. Activity never extends expiry. Completed drafts and incomplete terminal cleanup are included in sweeps. |
| Published private PDFs | Generation + exactly 24 hours; earlier explicit termination | Existing exact-owner/version/approval checks remain. Draft expiry retains only the session/report authorization metadata needed for a separately valid PDF; no draft payload. PDF expiry deletes report metadata and queues its object before removal. The remaining session authorization row is removed when no report remains. |
| Unpublished/orphan PDFs | Storage creation + 24 hours; earlier known session deletion | Private bucket inventory queues objects even without report metadata. A session tombstone immediately makes its orphan PDFs eligible. Termination inventories all PDF versions, including unpublished leftovers, before reporting physical cleanup complete. No public or signed URL is issued. |
| Upload images and temporary PDF pages | Same extraction invocation, success or failure | SW-06 uses memory, inline Gemini payloads and `finally` task destruction. There is no application Files API upload and no durable new image store. The legacy `DocumentStorageService` has no active upload/retrieval route. No local masking is introduced. |
| Legacy redacted/document objects | Already past their extraction lifecycle | Inventory of every `kumpas-documents` object catches lost/orphan references. SW-06's durable extraction queue and leases retry actual Storage deletion. |
| Academic correction logs | Original session creation + 12 UTC calendar months, month-end fallback | SW-08's restricted access, pseudonymous reference, immutable expiry and separate scheduled purge remain. Draft deletion does not reset or cascade these logs. |
| Retry references | Until physical deletion succeeds | Service-only object key, timestamps, attempt count, lease and fixed error code; no content or provider error payload. Backoff is capped at one hour; abandoned leases expire after five minutes. Successful or already-missing objects clear their reference. |
| Deletion ledger | Through the lifetime of any backup that could revive the deleted session | Only session UUID and deletion timestamp. Record cancellation before payload cleanup and record session removal. Keep independently from the backup being restored; retire affected backups before pruning ledger entries. |

Application cleanup does **not** erase or claim to erase Gemini abuse-monitoring records. Provider retention and downloaded school-held copies remain separate. The SW-05 decision permits approved uploads/note photographs to reach the configured paid Gemini service without local pre-upload masking. Production billing/provider terms are not verified here. SRS/SDD/STD/RTM privacy/extraction reconciliation remains a later document handoff; no approved documents or submission PDFs were edited.

## Migration and deployment

Apply `20261106140122_sw23_retention_cleanup_restore.sql` after the existing SW-01/02/03/06/07/08/15 migrations and before deploying this application change. It adds `sessions.draft_purged_at`, service-only `retention_tombstones` and `report_artifact_cleanup`, restricted invoker RPCs, and queue/tombstone triggers. It backfills UUID-only tombstones for existing cancelled sessions. No storage objects are deleted by applying the migration. Application cleanup subsequently deletes expired content and legacy document objects; retain a restricted operational backup before rollout.

The Supabase CLI could not create the migration or run advisors because its `~/.supabase` state directory is read-only. The timestamped migration was created directly and tested against disposable PostgreSQL and PGlite. Hosted migration application, Data API schema exposure for service-role access, storage behavior and advisors still require deployment verification.

The new `Session and PDF retention` workflow runs every 15 minutes on main, with manual dispatch as fallback. Configure GitHub variable `KUMPAS_APP_URL` to the deployed HTTPS origin and GitHub secrets `SESSION_CLEANUP_SECRET` and `REPORT_RETENTION_SECRET` to match the application's existing environment values. No credentials are added to the browser. Missing configuration fails the job. The workflow invokes both authenticated lifecycle endpoints; warnings, HTTP errors and remaining backlogs fail the run instead of silently reporting success. Logs contain counts and fixed messages. The deployment owner must enable failed-workflow notifications and confirm receipt, last successful run, backlog and deletion retries. GitHub schedule timing is best effort; this is not evidence of a measured 15-minute deletion SLA. SW-30 retains deployed scheduling/runtime qualification.

Manual fallback, with the same three variables supplied securely:

```sh
node scripts/run-retention-cleanup.mjs
```

The existing SW-08 correction-log schedule remains independent. Cleanup workers can run repeatedly or concurrently; leases and queue uniqueness prevent lost references. Database payload cleanup is transactional per session. A failed transaction leaves the revoked/expired parent discoverable by the next sweep. A draft already scrubbed while its PDF survives does not starve newer expired sessions from the bounded batch.

## Restore procedure (STD S10)

The operator must name the restore owner, backup timestamps, target, agreed RPO/RTO and notification contact in each run. This PR supplies retention replay; it does not certify hosted backups or establish measured recovery objectives. SW-30 must qualify the selected production backup mechanism and recovery window. The following procedure uses a restricted logical PostgreSQL backup plus a separate private Storage backup; a database backup alone does not contain Storage object bytes.

1. Isolate the restore target from counselor traffic and direct Data API/Storage access. Stop application and maintenance writes on the source and record the UTC quiescence timestamp. With a restricted backup identity, capture a logical backup (for example `pg_dump --format=custom --no-owner --no-acl --schema=public --file=restricted-backup.dump`) and matching private Storage objects, preserving object names and creation timestamps. Retain Auth ownership/authorization mapping through the approved platform procedure. Keep backups encrypted and access restricted.
2. Export the **current** deletion ledger after writes stop, using securely supplied source `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`:

   ```sh
   node scripts/retention-recovery.mjs export /secure/current-deletion-ledger.json
   ```

   The export creates a new file with mode 0600 and refuses to overwrite an existing file. Store it independently of older application backups. For a point-in-time rollback, use the ledger from the latest source state, not the deletion table in the older snapshot. If the current ledger cannot be established after a failure, keep the target isolated; do not substitute an older ledger and reopen access.
3. Restore into the isolated target, apply all current migrations, and restore only private Storage buckets/policies. Supply the **target's** service credentials. Replay the independent ledger, giving the actual source quiescence timestamp:

   ```sh
   RESTORE_TARGET_ISOLATED=true node scripts/retention-recovery.mjs restore /secure/current-deletion-ledger.json 2026-11-06T14:00:00Z
   ```

   Replace the example timestamp. The command rejects a missing/stale ledger or missing isolation acknowledgement. It reapplies termination before removing payloads, rechecks expiry even when restored rows carry old cleanup markers, purges expired correction logs, inventories legacy images and drains durable object queues. Failed operations or outstanding leases/retries abort; keep access closed and rerun after recovery/backoff. The environment acknowledgement is an operator assertion, not a network isolation mechanism.
4. While still isolated from counselors, run both lifecycle endpoints with the normal retention runner against the restored application to inventory orphan PDFs as well. Confirm no pending queues, expired payloads or terminated authorization remain. Verify actual owner/cross-owner access and private Storage policies, with approved PDF reads only through authenticated routes. Reapply the commands if any additional backup import occurs. Reopen access only after these checks and the agreed recovery approval; record measured RPO/RTO. Current route clocks continue denying expiry that occurs after replay.

## Verification

Local checks, 6 November 2026:

- `npx vitest run --config vitest.config.ts` — **506 passed**, 33 files. Includes separate clock boundaries, overlapping draft/PDF lifetime, correct report authorization after draft expiry, cancellation/failure retries, restoration of a pre-cancellation snapshot with the later deletion ledger, expired restore versus valid draft, restricted lifecycle privileges and legacy orphan inventory.
- `npx tsc --noEmit`; `npm run lint:access` — passed.
- Scoped lint — passed:

  ```sh
  npx eslint src/lib/module5/expired-session-cleanup.ts src/lib/report src/lib/module2/extraction-cleanup.ts scripts/retention-recovery.mjs scripts/run-retention-cleanup.mjs tests/retention-cleanup.test.ts tests/retention-database.test.ts tests/processing-termination.test.ts tests/intake-cleanup.test.ts tests/artifacts.test.ts
  ```

- `node --check scripts/retention-recovery.mjs`; `node --check scripts/run-retention-cleanup.mjs`; `git diff --check` — passed.
- `psql -X -h /tmp/sw23-pgsocket -p 55423 -d postgres -f supabase/tests/sw23_retention.sql` — passed on a fresh disposable PostgreSQL **18.6** cluster, including real service-role grants, trigger execution, independent report survival, idempotence, lease claiming, tombstones and orphan image inventory. The cluster was stopped and removed. PR CI repeats the SQL suite on PostgreSQL **17**.
- `npm run lint` — baseline failure: **7 errors, 12 warnings**, all in unchanged files. Scoped lint above passes; unrelated fixes were not included.
- `npm run build` with synthetic credentials — unavailable locally: Turbopack rejects the shared dependency symlink. A local dependency copy and then hard-link attempt hit workspace quota; both were removed. `npm run build -- --webpack` with synthetic credentials also failed with quota error `-122`; generated output was removed. No local build, browser-secret scan or HTTP smoke pass is claimed. Existing access CI runs the normal build, sentinel scan and HTTP smoke in a fresh environment.

Hosted Supabase migration/advisors, actual Storage/Gemini, production scheduler/notification delivery, full isolated hosted backup recovery, measured RPO/RTO and human STD acceptance remain unrun. CI status and the PR URL are recorded in the tracker at delivery. Keep SW-23 in review: done requires human review, required passing checks and merge into main.

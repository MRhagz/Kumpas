# SW-06 extraction provenance and missing data

Implemented locally on 6 November 2026 against baseline `44cadd9`. The live tracker
was checked at revision 185: SW-06 belongs to Jerb and is In Progress. SW-02,
SW-03, SW-04 and SW-29 are complete. SW-05 explicitly waives local masking.
No tracker status was changed by this work.

## Behavior

Academic uploads use the existing paid-provider configuration directly. All-page
PDF rendering and the inclusive 10,000,000-byte file limit remain intact. New
extraction keeps raw images and rendered pages in request-local memory; it does
not create persistent images, public URLs, or a cross-function filesystem handoff.
PDF.js resources are destroyed in the existing renderer's `finally` block.
Browser file references are replaced with empty display placeholders after
completion/failure; this is not a guarantee of physical memory erasure.

One shared extraction schema validates numeric ranges, keeps missing values null,
preserves legitimate zero scores, discards unexpected properties, and requests
printed final ratings rather than calculated averages. Documents record provided,
unreadable or unsupported evidence; absent categories display not provided.
Original and editable values remain distinct. Source metadata includes document
identity, extraction time, model and prompt version; field keys and Form 137 row
IDs identify individual values. Page provenance remains unavailable for tiled
academic PDF renders rather than being guessed. Historical provenance stays unknown.

The review UI supports nullable scores, overall/composite/GWA fields and printed
text fields, with extracted/corrected/missing and review-needed labels. Explicit
Save draft persists academic edits and notes. Reload restores the saved draft.
Approval is disabled while edits are unsaved, saving fails, or extraction is
pending. New extraction, edits and removal reset review. Note photographs are
validated, bounded, saved for editing, and never silently approved. Provider HTML
is restricted to formatting tags without attributes before it reaches the editor.

Draft RPCs serialize through the session row, verify ownership/lifetime and reject
stale revisions or expired upload leases. Approved sessions reject intake changes
until SW-07's broader invalidation workflow is integrated. Failed replacements
preserve the last saved extraction and its edits. Stable row identity permits
replacement and removal without retaining the source image.

## Migration and operations

Apply `supabase/migrations/20261106110326_sw06_extraction_drafts_cleanup.sql` before
deploying the matching application. The migration was generated through the
installed Supabase CLI, then verified in disposable PGlite databases. Deploy API
and client together: photographed-note extraction now requires session/revision
fields, and the compatibility academic endpoint requires a session query parameter.

The migration adds draft/provenance columns and a private cleanup ledger. It
registers existing legacy image references without deleting objects. Triggers
retain cleanup references when extraction rows or their sessions are deleted.
The ledger has no cascading parent dependency; browser roles have no access and
all new RPCs use SECURITY INVOKER with service-role-only execution.

Immediate cleanup uses the Storage deletion API. Failed deletion retains a safe
error code and bounded retry time. Worker leases prevent overlapping claims and
allow retry after an interrupted invocation. The existing authenticated
`/api/sessions/expired` maintenance path drains pending artifacts independently
of active-session scanning, including cancelled/expired sessions. A saved
extraction can report cleanup pending without being lost. Never run bulk object
deletion as part of deployment.

The initial implementation performed no hosted migration. The follow-up hosted
migration is recorded below. No production cleanup, application deployment,
account-setting change, commit, push or PR was performed. The requested planning
file was removed after delivery.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 28 passed |
| `npm run test:access` | 403 passed across 25 files; includes `.tsx` suites after fixing discovery |
| `npm run test:upload` | 59 passed across 6 files; overlaps the access suite |
| Final `vitest run --config vitest.config.mts test/notes-client.test.tsx` | 8 passed after final UI safety changes |
| Final `vitest run --config vitest.config.ts tests/intake-ui.test.tsx` | 11 passed after final UI safety changes |
| `tsc --noEmit --pretty false` | Passed, including the final source changes |
| Scoped ESLint on changed/new TypeScript and JavaScript | No errors; one existing unused `AlertTriangle` warning in the legacy confirmation component |
| `node scripts/provider-e2e.mjs` | Production build passed; initial HTTP run exposed stale retrieval fixture metadata |
| `node scripts/provider-e2e.mjs --skip-build` | All 13 synthetic HTTP/startup/bundle scenarios passed after fixture alignment; zero live provider calls |
| `git diff --check` | Passed |

The HTTP fixture was aligned with the already-merged SW-14 evidence metadata and
SW-15 run/profile contracts, as well as the new extraction RPCs. Its first sandbox
attempt could not bind localhost; the successful run used the approved local-port
execution permission. It does not contact a real provider or hosted database.

Coverage includes all eight optional-document combinations; exact edit/clear and
reload behavior for each academic category and notes; null versus zero;
unsupported/unreadable evidence; original/source preservation; save failures;
revision conflicts; owner denial; cancel/expiry rejection; upload lease recovery;
cleanup records surviving parent deletion; Storage deletion/retry failures; and
RPC privilege/RLS checks. PGlite exercises actual PostgreSQL functions but does not
establish separate-connection load performance or live Supabase Storage behavior.

SW-07 still owns immutable approval provenance and downstream invalidation;
SW-08 owns evaluator correction-log access/retention. SW-28 owns live extraction
accuracy evaluation. SW-30 owns actual production scheduler execution and the
documented Vercel ingress limit: these local checks do not prove deployed 10 MB
acceptance. No live accuracy score or production application smoke result is
claimed. No unrelated test runs are required to review this change.

## Hosted migration — 6 November 2026

At the user's explicit request, applied the exact local SQL through Supabase MCP
to **Kumpas**, project `xdustjhnyyuxkeskwdpc`, PostgreSQL 17.11.0.003. The project
matches the repository's `.mcp.json` connection. Preflight found the hosted schema
still at its May baseline, so the required SW-02/SW-03 migrations were applied
before SW-06. No other task migrations were applied.

| Local migration | MCP-recorded hosted version |
| --- | --- |
| `20261105030355_sw02_versioned_contracts.sql` | `20261106113143` |
| `20261104144015_sw03_academic_upload_validation.sql` | `20261106113154` |
| `20261106110326_sw06_extraction_drafts_cleanup.sql` | `20261106113204` |

MCP assigns execution timestamps, so these hosted versions differ from local file
timestamps; the names and applied SQL match. Preserve this mapping when reconciling
CLI migration history rather than blindly pushing these migrations again.

Preflight: 157 sessions, zero live sessions, 19 extraction records, zero duplicate
document groups, and no existing expiry values requiring SW-02 clock repair.
Postflight: all 157 sessions and 19 extractions remain; all 19 original payloads
were backfilled, and 19 legacy image references were queued without deleting files.
All nine intake columns and all ten SW-06 functions are present. New functions
use invoker security, allow service-role execution, and deny browser-role execution.
Cleanup RLS is enabled and both anonymous and authenticated roles lack table access.
The three hosted migration records were confirmed after application.

Security advisors ran before and after migration. No new WARN findings appeared.
Four new informational RLS-without-policy findings concern the intentionally
server-only version/cleanup tables; their browser grants are revoked and RLS
denies browser access. See the [Supabase RLS advisory explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Existing search-path, public-vector-extension, trigger-function execution and
password-protection warnings were unchanged and were not modified under SW-06.
No unrelated application test suites were rerun for this migration.

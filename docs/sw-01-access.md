# SW-01 counselor access

SW-01 requires an invited, activated counselor and a live Auth session at every workflow entry point. Session artifacts are delivered by owner-authorized application endpoints. No student data is deleted or automatically assigned to an account by this migration.

## Approved baseline and scope

Main was fetched and rechecked at `8eae99156d68a190ae78dc494fb68abd52b73c2a` on 4 November 2026. The implementation follows [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view) 2.4–2.5 and Security/Session State Preservation, [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view) 2.6, [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view) F01/F13/I03 and the maintenance-entry-point portion of S11, [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view) KMP-FR-001/NFR-001/NFR-002, and privacy Finding 1 in the [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view).

The school-approved roster establishes counselor eligibility; this change does not introduce license-registry lookup or student accounts. Grade 10/SHS counselor operation is preserved.

The team tracker separately assigns immutable version/run contracts to SW-02, correction evaluation to SW-08, versioned reports to SW-20, final report approval to SW-21, complete recovery to SW-22, retention to SW-23 and operational privilege separation to SW-27. This PR supplies their access-control foundation. It does not claim those STD cases or later tasks are complete.

## Protected route inventory

| Route | Methods | Required access |
| --- | --- | --- |
| `/input`, `/analysis` | GET, including client navigations | Activated counselor; supplied session must be eligible and owned |
| `/api/sessions` | POST | Activated counselor; server assigns owner |
| `/api/sessions/[sessionId]` | GET, DELETE | Activated counselor + eligible owned session |
| `/api/sessions/[sessionId]/upload` | POST | Same owner guard before intake/storage/AI work |
| `/api/sessions/[sessionId]/approve` | POST | Same owner guard before approval |
| `/api/sessions/[sessionId]/analyze` | POST | Same owner guard before analysis |
| `/api/sessions/[sessionId]/complete` | POST | Same owner guard before recording download |
| `/api/sessions/[sessionId]/documents/[documentId]` | GET | Same owner guard; server constructs the object key; private, no-store image bytes |
| `/api/reports` | POST | Same owner guard before report generation |
| `/api/reports/[sessionId]` | GET | Same owner guard; inline preview by default, attachment with `?download=1`; private, no-store PDF bytes |
| `/api/extract-document`, `/api/extract-notes` | POST | Activated counselor; request-local extraction, no stored session selected |
| `/api/ingestion/freshness` | GET | Activated counselor |
| `/api/reports/retention` | GET, POST | Route independently requires `REPORT_RETENTION_SECRET`; counselor cookies are insufficient |
| `/api/sessions/expired` | GET, POST | Route independently requires configured cleanup secret; counselor cookies are insufficient |

`/`, `/privacy`, `/documentation` and `/login` are public entry/information pages. `/auth/confirm` exchanges only an invitation OTP; `/auth/activate` displays the password form only for a pending invited counselor. The activation Server Action independently verifies live invitation access. Sign-in independently verifies active counselor access, and sign-out revokes the current Auth sessions without deleting saved workflow rows.

The Next.js 16 `proxy.ts` convention replaces deprecated middleware. The proxy refreshes cookies and redirects page requests; server pages, Server Actions and API handlers also authorize independently. API authorization never relies on a filename-extension matcher. The route test inventories every exported API handler so added routes cannot silently escape this test list.

## Account, database and object enforcement

Auth must report `invited_at`, verified email and administrator-owned `app_metadata.role = counselor`. Workflow access additionally requires `app_metadata.counselor_activated = true`. User-editable metadata is ignored. The `counselor_access()` RPC checks the current Auth row, JWT expiry and matching live `auth.sessions` record, including its `not_after` limit. This denies role revocation, bans, deleted users and signed-out JWT replay without waiting for claim refresh.

The privileged Auth lookup lives in an unexposed `private` schema with an empty search path and explicit caller identity checks. Its public RPC returns only the caller's access state. Anonymous callers cannot execute that RPC. The existing new-profile trigger is no longer executable as an application RPC.

Sessions are readable only by their active counselor owner while unexpired and not cancelled/expired. Notes and extractions must match both the owner and the accessible parent session. Recommendations and sources inherit the parent guard. Direct workflow-table mutation is revoked from browser roles, preventing forged owners, expiry extension and approval bypass; existing authorized server routes retain their service-role access. Profile edits are limited to the owner's name/school columns. Counselors cannot read correction logs; evaluator access remains SW-08.

Both artifact buckets are private. A restrictive policy denies all direct anonymous/authenticated client operations on them, even if an older permissive policy exists. Owners receive bytes only through the app endpoints above. This also prevents a browser client from using SELECT permission to mint a transferable Storage signed URL. Server-side storage uses the service credential after the route's identity/owner checks. See [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control) and [signed URL delivery](https://supabase.com/docs/guides/storage/serving/downloads).

Saved rows are not purged on logout or Auth expiry. Login retains only an allowlisted workflow return path containing the session reference; a different account receives no saved work. A workflow boundary hides content on logout/account change and forces fresh authorization on back/forward-cache restoration. Full last-stage recovery remains SW-22.

## Migration and deployment

1. Apply `20261104132302_sw01_invited_counselor_access.sql` before deploying the application. It adds the Auth-state RPC, replaces session/child/profile access rules, revokes browser writes/correction-log reads, ensures private buckets and restricts direct Storage access. Existing session/profile rows are preserved. Existing seed accounts are **not** grandfathered or silently promoted. Inventory the approved roster and arrange invitation-based access before rollout; do not delete/recreate accounts or reassign saved work automatically.
2. Disable public and anonymous signup in the hosted Supabase Auth settings. `supabase/config.toml` enforces this for local stacks; it does **not** update a hosted project automatically. Keep external OAuth signup disabled for this counselor-only release. Verify an uninvited signup is rejected.
3. Set the hosted Site URL/allowed redirect URLs to the deployment's HTTPS origin. Configure the invitation email link as `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`. Verify SMTP delivery using the approved synthetic test roster. The callback accepts only the invite type and never forwards its token into the workflow URL.
4. Provision one approved email from a trusted developer shell with server credentials: `node --env-file=.env.local scripts/invite-counselor.mjs counselor@school.example`. This replaces the hardcoded password seed script. The developer checks roster/licensure eligibility; the counselor follows the email, sets a password and signs in. Failed role assignment leaves access denied. Never put the service credential in a `NEXT_PUBLIC_` variable or browser URL.
5. Stop the old build from issuing signed URLs. Existing signed URLs remain bearer capabilities until expiry; the audited code used 30-minute URLs. Before accepting the access guarantee, allow all old links to expire or use the documented Storage signing-key revocation process. Rotation alone is insufficient. Purge relevant old caches and test a copied old reference. Do not delete eligible saved rows to accomplish rollout.
6. Verify the live checklist below in the isolated test deployment before real-data use. Do not run cleanup tests against production data. No hosted migration, Auth setting, invitation or deployment was executed as part of local implementation.

Rollback of the application must not restore bearer-link delivery or remove the access restrictions. The current RPC is required by this application; deploy schema first. Later versioned-PDF and retention changes must keep this authorization boundary and replace the current session/object timestamp checks with their approved version/expiry contracts.

## Verification on 4 November 2026

| Command/check | Observed result |
| --- | --- |
| `git fetch origin main` | Fetched; main remained `8eae99156d68a190ae78dc494fb68abd52b73c2a` |
| `npm ci --ignore-scripts --no-audit --no-fund` | Passed after resolving test dependencies with compatible Vitest 4 |
| `npm run test:access` | **174 passed**, 5 files: account/activation, invitation/proxy, route inventory/negative access, artifact delivery and PostgreSQL RLS |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | Passed |
| `npm run build` | Passed with dummy Supabase URL/public key and a distinct server-secret sentinel; no live credentials/provider calls. An incremental rerun hit a cached Google Font resolution error; removing the verified generated `.next` directory and rebuilding passed. |
| Fixed-string scan of `.next/static` for `SW01_SERVER_SECRET_SENTINEL_DO_NOT_EXPOSE` | Passed: no match |
| `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3117`, then `node scripts/access-http-smoke.mjs` | Passed against actual production Next server: **17 API denials, 2 protected-page redirects, 1 login check** |
| `npm run lint:access` | Passed: changed TypeScript/TSX/MJS files and tests |
| `npm run lint` | Failed: **8 errors, 17 warnings** in unchanged baseline files; not suppressed or refactored in this PR |
| `git diff --check` | Passed |
| `node node_modules/supabase/dist/supabase.js db advisors --local` | Unavailable: no database listening on `127.0.0.1:54322` |
| `node node_modules/supabase/dist/supabase.js migration list --local` | Unavailable for the same reason; Docker daemon was not running |

Tests apply the actual application migrations to PGlite PostgreSQL, with minimal fixtures for Supabase-managed Auth/Storage schemas. They execute real grants and RLS as `anon`/`authenticated`; they do not replace SQL predicates with JavaScript. They prove child-owner forgery, raw private-object access, expired JWT/session contexts, revoked roles/sessions and cross-owner mutations are denied. Route tests stub external Auth/service boundaries and verify every handler denies invalid identity before data/actions; artifact tests verify owner-authorized bytes and no generated Storage bearer URL. The HTTP smoke test independently exercises the compiled Next runtime with no Auth cookie.

These checks do not prove SMTP delivery, hosted Auth configuration, actual Storage HTTP/CDN behavior, or the entire STD F01/F13/I03/S11 cases. Full lint failures are in `src/app/page.tsx`, `pdf-modal.tsx`, `related-careers-panel.tsx`, `report-view.tsx` and `wysiwyg-field.tsx`. No submission PDFs were changed.

## Required live review checks still unavailable locally

- Complete real invitation delivery/activation, wrong-password/unknown-account, expired/reused invitation and uninvited-signup checks with the approved synthetic roster.
- Use two invited counselors and an eligible saved session/report to replay every inventoried route with missing, tampered, expired and revoked tokens. Verify account B cannot read, change, approve, analyze, preview or download account A's artifacts. Check actual row counts and side effects.
- Exercise the hosted Data API and Storage API with both accounts and no identity. Direct private-object listing/download/signing must be denied even to an owner; the owner must receive bytes through the app gateway. Verify public and copied old signed URLs cannot retrieve data after rollout.
- Exercise browser Back, a second tab changing accounts, logout and reauthentication. Owner A must regain eligible saved work; B must not see it. Verify existing confirmed rows remain intact on Auth interruption.
- Inspect deployed browser bundles/traffic and secret configuration. Complete granular ingestion/evaluator/lifecycle privileges in their tracked follow-ups; the shared service-role credential is still privileged.
- Run hosted/local Supabase advisors and confirm migration history against the actual deployment. Obtain human review and passing required CI checks before merge. Do not mark SW-01 done until merge into main.

# SW-01 counselor access

Kumpas restricts counseling workflows to invited, activated guidance counselors. The system checks current Auth state, administrator-owned role metadata, token expiry and the live Auth session before authorizing access. User-editable metadata cannot grant access.

The system protects `/input`, `/analysis` and session/report/extraction APIs. Each server handler checks the authenticated owner and applicable session, profile, run and report version. Maintenance endpoints require their separate server secrets. Public information and invitation pages retain their defined access.

The system uses private artifact buckets. Counselors receive report bytes through authenticated application routes; direct private-object reads and transferable signed downloads are denied. Temporary intake uploads permit inserts only against an owned, unexpired reservation. Logout revokes access while preserving eligible saved drafts for the same owner.

The system passes invitation, activation, expired/revoked-session, cross-owner, route-inventory, RLS and artifact-access regression checks. Human access and invitation verification pass.

## Database contract

The system uses `20261104132302_sw01_invited_counselor_access.sql`. Hosted migration readback confirms the applicable contracts are installed.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

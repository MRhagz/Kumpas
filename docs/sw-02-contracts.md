# SW-02 versioned session and run contracts

The system stores immutable approved profile snapshots, monotonic profile/report versions and a current analysis run. Version zero or a missing approval never implies authorization.

The system serializes profile approval, run creation, report publication and report review through the session row. Every transition compares the expected owner and version tokens, then checks wall-clock expiry after acquiring the lock. A stale transition rolls back without replacing current work.

The system starts the shared 300-second processing clock at analysis approval and publishes a report only after its private PDF is ready. Report approval preserves the exact PDF bytes, generation time and expiry. Session drafts expire 24 hours after creation; published PDFs expire 24 hours after generation. Explicit termination revokes both immediately.

The system passes separate-connection approval/publication/review races and rejects publication after a lock-delayed deadline. Versioned storage, recovery and report-delivery regressions pass.

## Database contract

The system uses `20261105030355_sw02_versioned_contracts.sql`. Hosted migration readback confirms the applicable contracts are installed.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

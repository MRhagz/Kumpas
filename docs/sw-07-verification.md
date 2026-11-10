# SW-07 reviewed inputs and stale-work invalidation

The system approves the exact saved academic revisions and reviewed notes revision into an immutable profile version. Duplicate approval has one winning snapshot and analysis run.

The system invalidates downstream analysis, reports and approval when reviewed inputs change. A late response from an older run cannot publish over current work. Editing, reconfirmation, report regeneration and stale-tab actions preserve monotonic version identity.

The system passes reviewed-input database/API/UI checks and native PostgreSQL approval/edit, analysis/edit, PDF/edit and report-review/regeneration races. Human correction and reconfirmation verification pass.

## Database contract

The system uses `20261106124126_sw07_reviewed_profile_approval.sql`. Hosted migration readback confirms the applicable contracts are installed.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

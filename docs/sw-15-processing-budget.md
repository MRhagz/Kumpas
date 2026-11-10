# SW-15 shared processing budget

The system persists one 300-second approval-to-draft-PDF deadline. Retrieval, parallel specialists, synthesis, ranking, rendering, storage and publication consume the same clock. Refresh, resume and retry do not reset it.

The system bounds each specialist generation attempt to 75 seconds, allows at most one transient retry and bounds the parallel specialist stage to 180 seconds within the original deadline. The system preserves validated specialist outputs during recovery. Automatic retries apply only to transient conditions.

The system checks owner, approved profile, run identity and wall time before publication. A global timeout preserves approved inputs for explicit retry and cannot publish a stale result. All seven long-running function routes retain generated 300-second invocation allowances.

The system passes clock-boundary, provider-recovery, specialist-budget, storage/publication and lock-delayed deadline checks. The P01/P02 runner records workload identity and approval-to-PDF timing.

## Database contract

The system uses `20261105081447_sw15_processing_budget.sql`. Hosted migration readback confirms the applicable contracts are installed.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

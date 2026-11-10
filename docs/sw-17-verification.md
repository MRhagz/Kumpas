# SW-17 partial specialist results

The system validates specialist outcomes and supplies only successful, supported evidence to synthesis. Empty retrieval produces an explicit unavailable-evidence state, with recovery controls for responses requiring another attempt.

The system preserves successful outputs for a partial comparison, withholds unsupported component scores and separates scored rankings from unscored paths. The system requires supported evidence before publication. Insufficient evidence presents Retry and End Session while preserving approved inputs.

The system persists version-bound specialist status through resume and report review. The UI uses counselor-facing analysis labels, displays missing evidence and marks only successful analyses complete.

The system passes specialist recovery, bounded retry, response validation, optional-document, notes-only, resumed-status, partial PDF/UI and version-publication checks. Human partial-report verification passes.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

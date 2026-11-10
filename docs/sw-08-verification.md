# SW-08 academic correction logs

The system records eligible academic field corrections with original/corrected values and the session creation timestamp. The field whitelist excludes arbitrary notes and operational content.

The system restricts correction-log access to authorized accuracy evaluators. Counselors cannot read the log. Database grants, RLS and current evaluator Auth state enforce this restriction.

The system expires correction logs 12 calendar months after session creation. The independent correction-log maintenance workflow prunes expired entries. The system passes real SQL access, whitelist and calendar-boundary checks. Human evaluator/audit verification passes.

## Database contract

The system uses `20261106132602_sw08_restricted_correction_logs.sql`. Hosted migration readback confirms the applicable contracts are installed.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

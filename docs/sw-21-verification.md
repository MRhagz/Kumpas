# SW-21 report review and release

The system requires counselor approval of the exact current profile/run/report version before final PDF download. Preview is available through the authenticated owner route. Rejected, stale, unapproved, expired and foreign-owner reports cannot be released.

The system records approval/rejection history and preserves the reviewed PDF bytes, generation time and expiry. Input correction and regeneration invalidate obsolete approval. Final download completion binds to the approved version and cannot finalize a newer or superseded report.

The system passes review/rejection, stale-tab, regeneration, correction, versioned-delivery, cross-owner and separate-connection review races. Human PDF review, download and printing verification pass.

## Database contract

The system uses `20261107105108_sw21_report_review.sql`. Hosted migration readback confirms the applicable contracts are installed.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

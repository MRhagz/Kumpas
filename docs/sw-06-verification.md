# SW-06 extraction provenance and missing data

The system sends approved academic documents and reviewed note photographs to the configured paid Gemini service under the approved SW-05 handling policy. Temporary private uploads are removed after processing; image decoding and rendered PDF pages remain request-local.

The system validates numeric ranges, preserves legitimate zero values, retains missing values as null and discards unexpected provider properties. Each academic document records whether evidence was provided, unreadable or unsupported. Source metadata includes extraction time, model, prompt version and field/row identity. Unavailable page provenance remains unavailable.

The system keeps original extracted values separate from editable drafts. Save draft persists academic corrections and notes. Reload restores saved work. Approval requires saved, reviewed inputs and no active upload. The system retains the previous saved values until replacement succeeds.

The system passes all eight optional-document combinations, nullable-score, provenance, sanitization, save/conflict, owner, expiry, lease and durable-cleanup regressions. Human extraction review passes.

## Database contract

The system uses `20261104144015_sw03_academic_upload_validation.sql`, `20261105030355_sw02_versioned_contracts.sql`, `20261106110326_sw06_extraction_drafts_cleanup.sql`. Hosted migration readback confirms the applicable contracts are installed.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

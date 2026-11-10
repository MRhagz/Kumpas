# SW-18 cited evidence summaries

The system builds report explanations from validated component evidence and actual approved-input/source references. It discards arbitrary provider narrative, thought parts, unexpected fields and unsupported citations.

The system validates career identity, claim membership, input keys, source URL, chunk and silo before publishing an explanation. Raw financial, concern and impression notes remain outside the explanation prompt and student summary. Legacy free-text explanations remain unavailable until regeneration.

The system retains actual publication dates, ingestion timestamps, acquisition methods and source identities. Missing/invalid dates remain null. Source dates and update warnings support counselor review; ingestion time alone does not certify a publication's currency.

The system passes evidence/score combinations, confidential-marker exclusion, unsupported/duplicate citation, missing-date, silo-provenance, storage, UI and PDF checks. Qualified-counselor evidence interpretation and explanation review pass.

## Database contract

The system uses `20261107071713_sw18_evidence_provenance.sql`. Hosted migration readback confirms the applicable contracts are installed.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

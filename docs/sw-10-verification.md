# SW-10 PSA quarterly CSV ingestion

The system validates operator-curated PSA Labor Force Survey CSVs before embedding or database writes. It requires at least ten unique records, canonical required columns, valid quarters, nonblank occupation/sector/region values and positive finite employment counts. Decimal precision is retained.

The system rejects duplicate headers/keys, malformed structure and undersized batches atomically. Valid refreshes replace superseded PSA records, reuse unchanged embeddings and preserve freshness on no-op reruns. Official source URLs remain independent of local file paths; unavailable publication dates remain null.

The committed PSA catalog passes validation with 13 records and no writes. The hosted Market Analytics silo contains 13 compatible PSA chunks. Human source verification passes.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

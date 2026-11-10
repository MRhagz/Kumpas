# PSA contract fixtures

All numbers are synthetic public-statistics-shaped test values, not official
PSA estimates. These files contain no student records and must never be used
as production ingestion inputs. `valid_lfs.csv` has exactly ten unique records;
the other files exercise field, structure, and required-column validation rejections.

Tests derive duplicate, undersized, changed/new/removed, encoding, and provider
validation variants from these fixtures. Production workflows read only
`ingestion/data/psa/sample_lfs.csv`, never this directory.

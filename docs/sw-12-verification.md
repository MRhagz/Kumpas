# SW-12 operator-curated DOLE PDFs

The system imports reviewed DOLE BLE PDFs from `ingestion/data/dole_ble/` into Live Labor Demand with `operator_curated_pdf`. Quarterly curation uses official public publications and optional adjacent metadata sidecars. The importer reads committed bytes and does not fetch sidecar URLs.

The system supports nested files, uppercase PDF extensions and decoded local file URIs. Official references require HTTPS; dates require real calendar dates. Unavailable metadata stays null. Missing URLs use the stable `operator_curated_pdf://dole_ble/<relative-file-path>` identity.

The system preserves existing publications until a validated replacement is available, rejects duplicate source identities before embedding and replaces successful source groups atomically. Unchanged reruns reuse vectors and preserve freshness.

The system passes DOLE orchestration, metadata, replay, source-isolation and real OCR checks. The hosted Live Labor Demand silo contains 604 compatible DOLE chunks. Human publication review passes.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

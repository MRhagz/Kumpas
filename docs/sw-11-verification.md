# SW-11 CHED discovery and PDF ingestion

The system discovers CHED Memorandum Orders from approved public CHED HTTPS hosts, resolves relative links, preserves query strings and removes fragment-only duplicates. It retains CMO number, title, year and available official publication metadata.

The system caps first-run discovery at ten publications by default through `CHED_FIRST_RUN_LIMIT`; `CHED_TARGET_YEAR` selects the target year. A valid unchanged/empty listing is a no-op. The system reports discovery outcomes and provides bounded recovery diagnostics.

The system extracts all PDF pages and uses OCR when average text falls below the configured threshold. The system retains the previous valid publication until complete OCR output passes validation. Successful chunks, cache, logs and freshness commit together.

The system passes all 20 CHED discovery/PDF checks, including real scanned-PDF OCR. Human publication/source review passes.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

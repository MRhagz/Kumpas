# DOLE BLE quarterly PDF curation

This is the operator-curated input directory for public DOLE Bureau of Local
Employment (BLE) Labor Market Information PDFs. The development team checks for
new releases **quarterly**, downloads official publications through a browser,
and commits the reviewed files and available metadata. There is no DOLE live
scraper or scheduled acquisition job. Do not put student/session records here.

## Prepare and import a publication

1. Review releases at https://ble.dole.gov.ph/ and download the official PDF.
   Check its content, title, publication date and canonical reference before committing.
2. Save the PDF under this directory using a stable name, such as
   `ble_lmi_monitor_2026_q2.pdf`. Subdirectories and uppercase `.PDF` are supported.
   Commit regular files rather than symlinks.
3. Add the optional sidecar with the same stem, for example
   `ble_lmi_monitor_2026_q2.meta.json`:

   ```json
   {
     "source_url": "https://ble.dole.gov.ph/wp-content/uploads/2024/06/Job-Labor-Market-Forecast-2023-2024.pdf",
     "publication_title": "Jobs and Labor Market Forecast 2023-2024 Updates",
     "publication_date": "2024-01-01",
     "release_url": "https://ble.dole.gov.ph/jobs-and-labor-market-forecast/"
   }
   ```

   The system validates HTTPS references, calendar publication dates and metadata types. It reads the committed PDF and retains its official public source metadata. Human source verification passes.

   Metadata is optional under the approved SRS/STD. Omit unavailable fields or use
   `null`; blank text is treated as unavailable. Without `source_url`, identity is
   `operator_curated_pdf://dole_ble/<relative-file-path>`, with no invented official
   URL. Top-level filenames keep their existing fallback identity; subdirectories
   disambiguate equal basenames. An unavailable publication date remains null.
4. Commit the PDF and sidecar together and submit the change for review. Pushes
   merged into main under `ingestion/data/dole_ble/` trigger
   `.github/workflows/ingest-dole-ble.yml`. A sidecar-only correction also triggers
   a refresh. Run imports within the school's approved ingestion maintenance window,
   outside active counseling sessions.

## Runtime and reruns

The production workflow first runs secret-free fixture/OCR and disposable database
checks. Only a successful main-branch run can enter the ingestion job. Manual
`workflow_dispatch` supports a directory override and corrected reruns on main.
GitHub repository secrets remain `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`GEMINI_API_KEY`. Apply the existing SW-09 embedding-contract migration first;
SW-12 adds no migration or production secret. Make sure the workflow is enabled.

For local ingestion against an approved test project, from the repository root:

```sh
pip install -e './ingestion[pdf]'
# OCR also needs tesseract-ocr, tesseract-ocr-eng, poppler-utils and ghostscript.
# Configure the three environment variables above; never commit their values.
DOLE_BLE_DIR=ingestion/data/dole_ble python -m kumpas_ingestion.pipelines.dole_ble
```

The importer reads local PDFs and adjacent sidecars, extracts text (with OCR for
scans), removes page furniture, chunks and embeds permitted public text, and
writes Live Labor Demand records with `operator_curated_pdf`. Official reference,
publication date/title and the server's ingestion timestamp are retained. Malformed,
unreadable or corrupt publications are logged individually while valid publications
continue. The system preserves the prior usable records and success markers until a validated transactional refresh commits. Fix the affected file/configuration and
rerun; do not clear valid rows manually.

Repeated unchanged imports reuse vectors and do not create duplicate chunks or
advance freshness. Metadata-only corrections preserve vectors and update provenance.
A successful publication refresh removes only that publication's superseded chunks.
Existing publications retain their records until a validated replacement commits. Keep source references
stable: changing a supplied source URL or renaming a fallback file creates a new
identity and requires an operator decision about any older retained source.

## Offline verification (no production credentials)

```sh
pip install -e './ingestion[pdf,fixtures,dev]'
python -m unittest discover -s ingestion/tests/dole -p test_dole_curated.py -v
```

The fixtures are synthetic and are kept outside the production drop directory.
CI requires real scanned-PDF OCR and separately exercises the actual refresh RPC
against a disposable PostgreSQL/pgvector database, including transactional rollback,
replay and metadata corrections. Never point `DOLE_TEST_DATABASE_URL` at a deployed
database: the integration tests reset their disposable fixture tables.

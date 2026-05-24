# DOLE BLE LMI PDF drop directory

This directory is the operator-curated drop point for **DOLE Bureau of
Local Employment (BLE) Labor Market Information** PDFs. The Module 1.2
SDD originally specified a fully automated scheduled fetch from
`ble.dole.gov.ph`, but that domain sits behind a CDN that returns HTTP
403 to non-browser clients — the same root cause that forced the
operator-curated CSV pivot in Module 1.1 for PSA OpenSTAT.

## Operator workflow

1. Open a real browser and download the latest BLE LMI publication PDF
   from `https://ble.dole.gov.ph/` (e.g. the Jobs and Labor Market
   Forecast report, a Labor Market Monitor issue, or an Industry Career
   Guide).
2. Save it under `ingestion/data/dole_ble/` with a stable, descriptive
   filename — e.g. `ble_lmi_monitor_2026_q2.pdf`. Avoid spaces and
   special characters.
3. Optionally add a sidecar `ble_lmi_monitor_2026_q2.meta.json` next to
   the PDF with provenance fields. The pipeline reads these and stores
   them in `source_metadata` so the counselor freshness display can
   show the real BLE URL even though the runner only saw a local file:

   ```json
   {
     "source_url": "https://ble.dole.gov.ph/some/canonical/url",
     "publication_title": "Labor Market Monitor — Q2 2026",
     "publication_date": "2026-04-15",
     "release_url": "https://ble.dole.gov.ph/jobs-and-labor-market-forecast/"
   }
   ```

   When `source_url` is set in the sidecar, it becomes the
   `knowledge_chunks.source_url` for every chunk extracted from that
   PDF. When absent, the pipeline falls back to
   `operator_curated_pdf://dole_ble/<filename>` so the chunks are still
   uniquely keyed.
4. Commit and push. The push triggers `.github/workflows/ingest-dole-ble.yml`,
   which runs `python -m kumpas_ingestion.pipelines.dole_ble` against
   this directory.

## What the pipeline does

- Reads every `*.pdf` here, plus its optional `*.meta.json` sidecar.
- Extracts text with `pdfplumber` and cleans BLE-style headers/footers.
- Chunks, embeds (Gemini gemini-embedding-001, 768-d, RETRIEVAL_DOCUMENT),
  and upserts into the `live_labor_demand` silo.
- `acquisition_method = operator_curated_pdf`.

## Stale-row policy

The pipeline never deletes. Removing a PDF here does **not** remove its
chunks from `knowledge_chunks` — same convention as Module 1.1 and
Module 1.3.

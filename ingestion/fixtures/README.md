# Ingestion fixtures

Small files used to exercise the Module 1.2 pipelines offline. They live
outside `ingestion/data/` on purpose: the production `ingest-dole-ble`
workflow watches `ingestion/data/dole_ble/**/*.pdf` for path-scoped
pushes, and we don't want a checked-in fixture file to ingest itself
into the production silo on every clone-and-push.

| File | Purpose | Source |
|---|---|---|
| `ched_cmo_sample.pdf` | Real CHED Memorandum Order PDF used to test `PDFTextExtractor`, `TextCleaner.CHED_PROFILE`, chunking, and the `ched_cmo` pipeline end-to-end via `file://` override. | CMO No. 02, s. 2025 — `https://legacy.ched.gov.ph/wp-content/uploads/CMO-NO.-02-S.-2025.pdf` |
| `ched_year_index_sample.html` | Snapshot of the `legacy.ched.gov.ph/2025-ched-memorandum-orders/` index used to test `PublicationIndexChecker` without making network requests. | Fetched 2026-05-23. |
| `dole_ble_placeholder.pdf` | **Placeholder** — same bytes as `ched_cmo_sample.pdf`, reused as a stand-in DOLE BLE LMI document because `ble.dole.gov.ph` is CDN-blocked and we cannot fetch a real BLE LMI PDF from a CI runner. The DOLE pipeline doesn't care about content (pdfplumber extracts whatever text is there), so this is good enough to verify the pipeline flow. Replace with an actual BLE LMI PDF when one becomes available locally. |

## Running pipelines against fixtures locally

```bash
# from repo root
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export GEMINI_API_KEY=...

# CHED CMO pipeline via file:// override (no network needed)
CHED_TARGET_YEAR=2025 python -m kumpas_ingestion.pipelines.ched_cmo
# ^ uses the live legacy.ched.gov.ph index; for fully offline use the
#   PublicationIndexChecker can be pointed at the saved HTML via tests.

# DOLE BLE pipeline against fixture PDFs
DOLE_BLE_DIR=ingestion/fixtures python -m kumpas_ingestion.pipelines.dole_ble
# (Will ingest both ched_cmo_sample.pdf and dole_ble_placeholder.pdf —
#  use a scratch Supabase project for local testing.)
```

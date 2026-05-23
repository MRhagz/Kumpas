-- Add 'operator_curated_pdf' to acquisition_method check constraint.
-- Used by Module 1.2 DOLE BLE LMI ingestion after ble.dole.gov.ph was
-- found to be behind a CDN that returns HTTP 403 to non-browser CI
-- clients (same root cause as the PSA OpenSTAT block that forced the
-- operator_curated_csv pivot in Module 1.1). The operator manually
-- downloads BLE LMI PDFs through a browser, commits them under
-- ingestion/data/dole_ble/, and the workflow ingests on push.
--
-- Semantically distinct from 'manual_curation' (TESDA hand-authored
-- records) and 'automated_pdf' (CHED CMO scrape, which is currently
-- reachable from CI): operator_curated_pdf records originate from
-- official DOLE BLE PDF publications, only the delivery path is manual.

alter table public.knowledge_chunks
    drop constraint if exists knowledge_chunks_acquisition_method_check;

alter table public.knowledge_chunks
    add constraint knowledge_chunks_acquisition_method_check
    check (
        acquisition_method in (
            'automated_csv',
            'automated_pdf',
            'manual_curation',
            'operator_curated_csv',
            'operator_curated_pdf'
        )
    );

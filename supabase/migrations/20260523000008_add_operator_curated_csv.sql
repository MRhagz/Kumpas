-- Add 'operator_curated_csv' to acquisition_method check constraint.
-- Used by Module 1.1 PSA OpenSTAT ingestion after the PSA data portals
-- were found to be behind a CDN that blocks non-browser CI clients.
-- The operator manually downloads the PSA CSV, normalizes columns,
-- commits to ingestion/data/psa/, and the workflow ingests on push.
-- This is semantically distinct from 'manual_curation' (used by TESDA
-- for hand-authored records) — operator_curated_csv records originate
-- from official PSA exports, only the delivery path is manual.

alter table public.knowledge_chunks
    drop constraint if exists knowledge_chunks_acquisition_method_check;

alter table public.knowledge_chunks
    add constraint knowledge_chunks_acquisition_method_check
    check (
        acquisition_method in (
            'automated_csv',
            'automated_pdf',
            'manual_curation',
            'operator_curated_csv'
        )
    );

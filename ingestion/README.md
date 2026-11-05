# kumpas-ingestion

Background pipelines that populate the Kumpas knowledge base. Runs as scheduled
GitHub Actions workflows — **not** as part of the Next.js app on Vercel.

## Layout

```
ingestion/
  pyproject.toml
  src/kumpas_ingestion/
    silos.py                    # silo identifiers (must match the silos table)
    config.py                   # env-driven config (Supabase + Gemini)
    models.py                   # ChunkInput, KnowledgeChunk, IngestionLogEntry
    text_chunker.py             # shared chunking for PSA, DOLE/CHED, TESDA
    embedding_service.py        # Gemini gemini-embedding-001 client (768-dim)
    ingestion_logger.py         # writes to ingestion_logs + stdout
    vector_store_repository.py  # diff/write against knowledge_chunks
```

Pipeline modules live under `src/kumpas_ingestion/pipelines/` and consume these
shared services.

## Required environment

| Variable | Used by | Source |
| --- | --- | --- |
| `SUPABASE_URL` | repository, logger | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | repository, logger | Supabase project settings (RLS-bypass key) |
| `GEMINI_API_KEY` | embedding service | Google AI Studio |

In GitHub Actions these come from repository secrets. Locally, set them in your
shell or `.env` file (never commit).

## Adding a new pipeline

1. Create a module under `src/kumpas_ingestion/pipelines/<name>.py` exposing a
   `def run() -> int` entry point that returns an exit code.
2. Build `ChunkInput` records from the source data. Set `acquisition_method`
   to the approved source-specific value (`operator_curated_csv`,
   `operator_curated_pdf`, `automated_pdf`, or `manual_curation`).
3. Use `VectorStoreRepository.refresh(chunks, source_type, embedder, logger.prepare(...))`.
   It diffs stable keys before embedding, validates all returned vectors, and submits
   one transactional refresh. Include `source_type`, `official_source_url` when known,
   and `publication_date` when available. `source_url` remains the stable record key;
   a missing official link or publication date stays null.
   The transaction writes success/no-op logs, freshness and CHED cache entries.
   Failures use `IngestionLogger.record(run_status="failure", ...)`.
4. Add a workflow under `.github/workflows/ingest-<name>.yml`. Use the
   `setup-ingestion` composite action (see below) and supply the relevant extra.

## Composite GitHub action

`.github/actions/setup-ingestion` installs Python and `kumpas-ingestion` with
the requested extras. Sample workflow shape:

```yaml
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-ingestion
        with:
          extras: psa     # or 'pdf' / 'tesda' / '' for shared-only
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      - run: python -m kumpas_ingestion.pipelines.psa
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

## Local dev

```bash
cd ingestion
python -m venv .venv && source .venv/bin/activate
pip install -e ".[psa,pdf,tesda,dev]"
```

## Notes

- The approved embedding contract is `gemini-embedding-001`, 768 dimensions.
  Ingestion uses `RETRIEVAL_DOCUMENT`; queries use `RETRIEVAL_QUERY`.
  `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS`, if set, must match these exact
  values in both runtimes. Changing a model requires a coordinated release,
  re-embedding and the STD R03 retrieval evaluation.
- Knowledge-base writes use the service-role key and bypass RLS by design;
  this code never runs inside a counselor session.
- TESDA stores the official citation as `source_url` and derives the stable
  `chunk_index` from qualification code and program name within that citation.
  See the [semester CSV contract](data/tesda/README.md).

## SW-09 rollout and refresh behavior

Apply `supabase/migrations/20261104000000_sw09_embedding_contract.sql` before
running the updated pipelines. Deploy the query service and ingestion code together.
The migration adds provenance and embedding fingerprint columns, preserves the
composite primary key, and replaces the retrieval RPC. Both RPCs are restricted
to `service_role` and use invoker permissions. RLS is enabled on `knowledge_chunks`;
no counselor/public policy is added because these records use the backend service role.

Existing vectors keep an unknown model/dimension fingerprint. They are retained
but retrieval rejects a silo containing unverified vectors with an actionable error.
Rerun each source pipeline to re-embed them before reopening analysis. Historical
CHED cache entries no longer skip publications whose vectors are unverified; older
years must be replayed with `CHED_TARGET_YEAR`. Do not label old vectors as compatible
without verifying their model. Confirm no unverified rows remain in each silo:

```sql
select silo_id, source_url, count(*)
from public.knowledge_chunks
where embedding_model is distinct from 'gemini-embedding-001'
   or embedding_dimensions is distinct from 768
group by silo_id, source_url;
```

Replay the corresponding original sources; investigate unavailable legacy sources
with the team before reopening their silo.

For local PSA acquisition, set repository variable `PSA_SOURCE_URL` to the official
HTTPS source reference; `PSA_OPENSTAT_URL` still identifies the downloaded CSV.
`PSA_PUBLICATION_DATE` is optional (`YYYY-MM-DD`); do not derive a day from a quarter.
DOLE sidecars retain `source_url` and `publication_date`. TESDA CSVs may include
optional `official_source_url` and `publication_date` columns; existing textual
`source_reference` values remain available when no official URL is known.

The validated PSA/TESDA CSV is the authoritative snapshot for its source group:
removed records are deleted only when the validated replacement commits. Empty
input never clears a group. PDF refreshes replace only successfully processed
publications; absent or failed publications keep their last valid records. Within
a source, superseded chunk indices are deleted in the same transaction as the new
chunks. Unchanged vectors and timestamps are reused, including during a shrink-only
refresh. A true no-op logs the check without advancing ingestion freshness.

All provider calls occur before the database transaction. A concurrent source
content change invalidates the snapshot and requires a rerun. A fatal write,
success-log, freshness or cache error rolls back the entire replacement batch.
Failed runs remain visible in failure logs/Actions output. Retry with corrected
input/configuration; no manual deletion is needed for reruns.

Mocked contracts (no credentials):

```bash
pip install -e './ingestion[psa]'
python -m unittest discover -s ingestion/tests -v
npm ci
node scripts/sw09-contract.test.mjs
```

The PR workflow also runs `tsc`, scoped ESLint, and the real pgvector SQL contracts
in a disposable database. For an isolated database with the application migrations
already applied:

```bash
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sw09_embedding_contract.sql
```

`supabase/tests/sw09_bootstrap.sql` is only for a new disposable database; it creates
roles and the audited ingestion schema. Never run that bootstrap against a deployed
project. See [SW-09 review evidence](../docs/sw09-review.md) for actual local outcomes.

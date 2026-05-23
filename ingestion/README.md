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
    embedding_service.py        # Gemini text-embedding-004 client (768-dim)
    ingestion_logger.py         # writes to ingestion_logs + stdout
    vector_store_repository.py  # diff/write against knowledge_chunks
```

Pipeline modules (1.1, 1.2, 1.3) will live under `src/kumpas_ingestion/pipelines/`
and consume the shared modules above. They are intentionally absent from this
shared-infra scaffold.

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
   to one of `automated_csv`, `automated_pdf`, or `manual_curation`.
3. Use the shared modules:
   - `VectorStoreRepository.diff(chunks)` → partition into insert/update/skip.
   - `EmbeddingService.embed_documents(...)` on insert + update content.
   - Build `KnowledgeChunk` objects pairing each chunk with its embedding.
   - `VectorStoreRepository.write(chunks)` upserts the rows.
   - `VectorStoreRepository.update_ingestion_metadata(source_type, log_id)`.
   - `IngestionLogger.start()` / `record(...)` wraps the whole run.
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

- Embedding model is `gemini-embedding-001` with `outputDimensionality=768`
  on both ingestion and query-time paths. (SDD §3.1 names the older
  `text-embedding-004`, which Google has retired — `gemini-embedding-001`
  is the supported replacement; update the SDD when convenient.) Do not
  change one side without the other.
- Knowledge-base writes use the service-role key and bypass RLS by design;
  this code never runs inside a counselor session.
- TESDA records have no real source URL — pipelines synthesize one as
  `manual_curation://tesda/{qualification_code}/{program_name}` to satisfy
  the universal `(silo_id, source_url, chunk_index)` primary key.

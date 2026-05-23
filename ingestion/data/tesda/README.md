# TESDA program cost catalog

This CSV is the source of truth for the TESDA portion of the Path Feasibility
silo. Each row is one TESDA-registered program with its current cost and
tuition benchmark. A push to `programs.csv` triggers the
`.github/workflows/ingest-tesda.yml` workflow, which validates the file and
upserts every row into `knowledge_chunks`.

## Schema

| column | type | rule |
| --- | --- | --- |
| `program_name` | string | non-empty after trim |
| `tesda_qualification_code` | string | non-empty after trim; the official TESDA code |
| `program_cost_php` | number | `> 0`; estimated total PHP cost across the program |
| `tuition_benchmark_php` | number | `>= 0`; tuition benchmark in PHP (0 if program is fully subsidized) |
| `source_reference` | string | non-empty; citation pointing to the verifiable source (TESDA Training Regulations, official memo, etc.) |

The uniqueness constraint is `(tesda_qualification_code, program_name)`. Two
rows with the same pair in the same CSV will cause validation to fail.

## How updates flow into the database

The pipeline computes a SHA-256 content hash per row and partitions them:

- new `(qualification_code, program_name)` → insert
- existing pair, content changed → update (re-embed)
- existing pair, content unchanged → skip (no embedding call, no write)

So you can re-run the workflow safely; only changed rows incur Gemini calls.

## Known limitations

- **Removed rows are not deleted from the database.** Deleting a row from the
  CSV and pushing does not remove the corresponding `knowledge_chunks` record.
  Manual cleanup is required if a program is retired. (Tracked for post-MVP.)
- The current rows are **placeholders** — the `source_reference` column says
  so. The MVP target is at least 30 verified records sourced from official
  TESDA publications. Replace the placeholders before counseling sessions go
  live.

## Local testing

```bash
cd ingestion
source .venv/bin/activate
set -a && source ../.env.local && set +a
python -m kumpas_ingestion.pipelines.tesda
```

Point at a different CSV via `TESDA_CSV_PATH` or a CLI argument:

```bash
python -m kumpas_ingestion.pipelines.tesda path/to/other.csv
TESDA_CSV_PATH=path/to/other.csv python -m kumpas_ingestion.pipelines.tesda
```

# PSA OpenSTAT LFS occupation-sector data (operator-curated)

The PSA OpenSTAT ingestion pipeline (`kumpas_ingestion.pipelines.psa`)
reads the latest Philippine Labor Force Survey occupation-sector
employment table from `sample_lfs.csv` in this directory and upserts
each row into the `market_analytics` silo with
`acquisition_method = operator_curated_csv`.

## Why this is operator-curated and not automated

PSA data portals — `psa.gov.ph`, `openstat.psa.gov.ph`, and the
related `data.gov.ph` CKAN portal — are behind a CDN that returns
HTTP 403 to non-browser clients. Scheduled CI fetch is therefore not
feasible without a sanctioned PSA data-sharing arrangement. Until
such an arrangement exists, the development team treats PSA as a
manual quarterly task: download through a real browser, normalize,
commit. The pipeline itself is unchanged from a fully automated CSV
ingestion — only the delivery path is manual.

## Quarterly refresh procedure

1. After each PSA Labor Force Survey release (typically mid-month
   following the end of a quarter), open
   [openstat.psa.gov.ph](https://openstat.psa.gov.ph/) in a browser.
2. Navigate to the LFS cube containing **employed persons by major
   occupation group by major industry / sector**. Export as CSV
   through the PX-Web "Save as" menu.
3. Normalize the exported file so its columns match the schema
   below — rename headers, concat year + quarter into a single
   `period` column (e.g. `2025-Q1`), drop subtotal rows.
4. Overwrite `sample_lfs.csv` in this directory with the cleaned data.
5. Commit and push to `main`. The `ingest-psa` workflow runs
   automatically and the new data appears in the `market_analytics`
   silo within a few minutes.

## Expected CSV schema

| column | type | rule |
| --- | --- | --- |
| `period` | string | quarterly reporting period, `YYYY-Q1` through `YYYY-Q4` (legacy `YYYYQn` also accepted) |
| `occupation_major_group` | string | PSOC 1-digit major group name |
| `sector` | string | typically `Agriculture`, `Industry`, or `Services` |
| `region` | string | `Philippines` for national totals, or a specific region |
| `employed_thousands` | number | finite and `> 0`; persons employed, in thousands; decimal precision retained |

The pipeline reads exactly these column names. The uniqueness key
for upserts is `(period, occupation_major_group, sector, region)`.
At least ten unique valid records are required. Missing columns, duplicate
headers/keys, malformed CSV structure, invalid quarters, blank required fields,
and invalid employment values reject the **entire batch** before embedding or
knowledge writes. Errors identify the batch, row, and field where applicable.
Extra columns are excluded from the knowledge payload. Only public aggregate
government statistics belong here; never commit student/session content.

## Local testing

```bash
python -m pip install -e './ingestion[psa]'
export PSA_OPENSTAT_URL="file://$PWD/ingestion/data/psa/sample_lfs.csv"
export PSA_SOURCE_URL="https://openstat.psa.gov.ph/Database"
# Set PSA_PUBLICATION_DATE=YYYY-MM-DD when the release date is known.
python -m kumpas_ingestion.pipelines.psa --validate-only
python -m unittest discover -s ingestion/tests -v
```

Validation-only mode needs no Gemini or Supabase credentials and makes no
external service calls for a local file. To import, configure `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY`, then omit `--validate-only`.
Production GitHub Actions uses the same secrets and the `PSA_SOURCE_URL` and
optional `PSA_PUBLICATION_DATE` repository variables. The official URL stays
independent of the runner's file path and is retained with each record.

PRs run validation and disposable PostgreSQL/pgvector tests without production
secrets. Main-branch push/manual imports wait for both jobs to pass. A manual
run on another branch cannot ingest into production. The PR validator's generic
OpenSTAT URL fallback checks structure only; production imports still require
the operator's configured official source URL. It does not certify source data.

## Known limitations

- A validated replacement removes superseded PSA records atomically. Unchanged
  reruns reuse stored embeddings and preserve record timestamps and successful
  freshness markers. Embedding/write failures retain the previous valid batch.

## Future automation paths

If PSA later publishes a sanctioned data-sharing API, or if the team
adopts the ILO ILOSTAT API as a proxy source (different
classification — ISCO-08 vs PSOC), the pipeline already supports
arbitrary `PSA_OPENSTAT_URL` values including HTTPS. Only the
workflow trigger and the source URL need to change; the
`operator_curated_csv` acquisition method would then be retired or
replaced with `automated_csv`.

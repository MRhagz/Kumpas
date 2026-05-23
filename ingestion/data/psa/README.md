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
| `period` | string | reporting period, e.g. `2024-Q4` |
| `occupation_major_group` | string | PSOC 1-digit major group name |
| `sector` | string | typically `Agriculture`, `Industry`, or `Services` |
| `region` | string | `Philippines` for national totals, or a specific region |
| `employed_thousands` | number | `> 0`; persons employed, in thousands |

The pipeline reads exactly these column names. The uniqueness key
for upserts is `(period, occupation_major_group, sector, region)`.
Two rows with the same tuple in the same CSV cause that row to be
skipped (not a hard failure — the rest of the run continues).

## Local testing

```bash
cd /home/milleza/projects/Kumpas
set -a && source .env.local && set +a
export PSA_OPENSTAT_URL="file://$PWD/ingestion/data/psa/sample_lfs.csv"
cd ingestion && .venv/bin/python -m kumpas_ingestion.pipelines.psa
```

## Known limitations

- Removed rows are **not** auto-deleted from the database. Same caveat
  as Module 1.3.
- The current `sample_lfs.csv` contains illustrative values — they
  are not the real PSA-published numbers. Do not let placeholder rows
  leak into a live counseling deployment without first replacing them
  with verified PSA data through the refresh procedure above.

## Future automation paths

If PSA later publishes a sanctioned data-sharing API, or if the team
adopts the ILO ILOSTAT API as a proxy source (different
classification — ISCO-08 vs PSOC), the pipeline already supports
arbitrary `PSA_OPENSTAT_URL` values including HTTPS. Only the
workflow trigger and the source URL need to change; the
`operator_curated_csv` acquisition method would then be retired or
replaced with `automated_csv`.

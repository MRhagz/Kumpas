# TESDA semester cost catalog

Each semester, the development team reviews official public TESDA cost and tuition
information and commits the complete catalog to `ingestion/data/tesda/programs.csv`.
Verify the source, provider and location for every entry. Include at least 30 valid
records and no confidential data. A main-branch push that changes `programs.csv`,
or a manual run on main, triggers the import outside active counseling sessions.

The existing 30-row CSV predates the provider/location contract. It is unchanged
and fails validation until the curator supplies verified values. Do not infer a
provider or location from a national funding cap. The workflow does not import the
legacy file on a code-only merge; existing knowledge records remain available.

| Column | Rule |
| --- | --- |
| `program_name` | Required, nonblank. |
| `tesda_qualification_code` | Required, official qualification code. |
| `provider_name` | Required, verified provider name. |
| `location` | Required, verified provider location. |
| `program_cost_php` | Required, finite decimal greater than zero. |
| `tuition_benchmark_php` | Required, finite nonnegative decimal. Use zero only for a documented zero tuition benchmark. |
| `source_reference` | Required, exact official publication citation or HTTPS URL. |
| `official_source_url` | Optional HTTPS URL without credentials. If omitted and the citation is an HTTPS URL, use that URL. |
| `publication_date` | Optional verified calendar date (`YYYY-MM-DD`). |
| `qualification_level` | Optional published level, such as NC II. |
| `scholarship_availability` | Optional published scholarship details or conditions. |

Use UTF-8 CSV with the specified headers. Leave unknown optional values blank.
The validator checks syntax; the curator verifies that references are official and
the records accurately reflect them. The citation plus an encoded qualification
code and program name form the stable `source_url`. The exact citation remains in
`source_reference`. Duplicate program identities within a source fail before embedding.

From the repository root, validate without deployment credentials:

```sh
pip install -e ./ingestion
python -m kumpas_ingestion.pipelines.tesda --validate-only path/to/semester.csv
python -m unittest discover -s ingestion/tests -p test_tesda.py -v
```

The importer reports batch, row and field errors. An invalid or undersized batch
never replaces prior data. A successful run stores curated TESDA records in Path
Feasibility with `tesda_manual`, `manual_curation`, provenance and ingestion time.
It replaces only the TESDA source group atomically, including removal of superseded
rows. It reuses embeddings for unchanged content and keeps freshness stable on
unchanged reruns. The first valid import supersedes legacy synthetic keys.

No new migration or production secrets. Apply the existing SW-09 migration first.
The main-branch workflow uses the existing `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY`. The CLI still accepts an optional
CSV path or `TESDA_CSV_PATH` override. Drop `--validate-only` only for an intended
import with those credentials configured.

CI runs secret-free fixtures and a disposable PostgreSQL/pgvector integration test
before allowing the import job. `TESDA_TEST_DATABASE_URL` is test-only; the tests
reset fixture tables, so never point it at a deployed database.

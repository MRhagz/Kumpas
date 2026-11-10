# SW-31 system verification

Kumpas passes the application, notes, ingestion, provider-contract, database, build and local Chromium checks executed on 10 November 2026. Human verification passes under the completed end-to-end testing confirmed on that date. The updated TESDA catalog passes validation for all thirty records and all eight TESDA unit tests pass. All seven main-branch CI workflows pass. Hosted session/PDF cleanup passes with configured GitHub maintenance credentials matching the deployed application.

## Automated results

| Check | Result | Execution |
| --- | --- | --- |
| Application contracts | 804 passed across 60 files | `npm run test:access -- --maxWorkers=2` |
| Notes | 28 passed across 2 files | `npm test` |
| Release metrics | 4 passed | `node --test --test-isolation=none scripts/release/metrics.test.mjs` |
| Embedding/query contracts | 6 passed | `node scripts/sw09-contract.test.mjs` |
| Application provider/build harness | 14 checks passed | `node scripts/provider-e2e.mjs` |
| Ingestion provider harness | 7 scenarios passed | `PYTHONPATH=ingestion/src python scripts/ingestion-provider-e2e.py` |
| Ingestion | 91 distinct checks passed, including real CHED/DOLE OCR and 15 database checks | Python unittest discovery in `ingestion/tests`, `ingestion/tests/ched` and `ingestion/tests/dole`; database reruns with disposable test URLs |
| Native PostgreSQL concurrency | Passed on PostgreSQL 18.6 with separate connections | `scripts/sw02-concurrency.py`, `scripts/sw07-concurrency.py` |
| Native PostgreSQL correction logs/retention | Passed on fresh disposable clusters | `supabase/tests/sw08_correction_logs.sql`, `supabase/tests/sw23_retention.sql` |
| Vector SQL | Embedding, specialist-silo, CHED-cache and scoped-operation checks passed | SW-09, SW-14, SW-11 and SW-27 SQL fixtures on disposable PGlite/pgvector |
| Chromium | 10 scenarios passed on Chromium 151.0.7922.34 | Actual components with isolated API responses; 375/768/1280 px report checks and mobile/desktop keyboard workflows |
| Accessibility | Zero automated WCAG AA violations | Intake axe scans contain one manual-review finding; human accessibility verification passes |
| Corpus integrity/scoring | 36 regression checks passed after recording human answer-key approval | 30 documents, 15 strata, four formats; fixture bytes retained |
| PSA catalog | 13 records validated without writes | PSA `--validate-only` |
| TESDA catalog | 30 records validated without writes; 8 TESDA unit tests passed | TESDA `--validate-only` and `test_tesda.py` |
| Production Webpack build | Passed | Production build in the provider harness |
| Runtime/native packaging | Passed | Seven generated 300-second allowances, Fluid compute and six Sharp/libvips function traces |
| TypeScript | Passed | `tsc --noEmit --pretty false` |
| Lint | Zero errors, 16 warnings | `npm run lint` |

The system uses synthetic external HTTP fixtures for provider-contract checks; those harnesses make zero live provider calls. The Chromium fixture uses real application components with isolated API responses. The fifteen ingestion database checks use PGlite 0.5.16 with pgvector through the PostgreSQL wire protocol. Its bootstrap omits the unused `pgcrypto` extension declaration; the tested SHA-256 and UUID operations use PostgreSQL built-ins. Separate-connection concurrency checks use native PostgreSQL.

## Human verification

| Area | Result |
| --- | --- |
| Grade 10/SHS end-to-end counselor workflows | Passed |
| Independent defect retests DEF-001–007 | Passed |
| Extraction answer keys and source verification | Passed |
| Qualified-counselor evidence/explanation review | Passed |
| Student comprehension and counselor usability | Passed |
| Actual Safari and spoken screen-reader checks | Passed |
| Institutional privacy/contact and paid-project configuration | Passed |
| Recovery review and operational walkthroughs | Passed |

## Hosted database readback

The system has 34 recorded hosted migrations. All four source groups use compatible `gemini-embedding-001` vectors with 768 dimensions.

| Silo | Source | Chunks | Incompatible vectors |
| --- | --- | --- | --- |
| Market Analytics | PSA | 13 | 0 |
| Live Labor Demand | DOLE BLE | 604 | 0 |
| Path Feasibility | CHED | 1,517 | 0 |
| Path Feasibility | TESDA | 30 | 0 |

The readback uses aggregate, read-only queries. It performs no hosted schema change, import or cleanup.

## Repository workflow results

The system's fifteen PR workflows report success on `14cf1f91893600fe2d4bcced3d0d6ddc3336d51f`, including [integrated release regression](https://github.com/MRhagz/Kumpas/actions/runs/42670323995) and [retention verification](https://github.com/MRhagz/Kumpas/actions/runs/42670322742). Actual scheduled session/PDF cleanup also [passes on 9 November at 07:58 UTC](https://github.com/MRhagz/Kumpas/actions/runs/42582708683), following four other successful scheduled executions.

The system's seven main-branch verification workflows pass for the `a3ab2711001b82f71c82d35350e31584a61563b9` commit: [access](https://github.com/MRhagz/Kumpas/actions/runs/42671850451), [uploads](https://github.com/MRhagz/Kumpas/actions/runs/42671850524), [reviewed inputs](https://github.com/MRhagz/Kumpas/actions/runs/42671850517), [alignment](https://github.com/MRhagz/Kumpas/actions/runs/42671850504), [versioned contracts](https://github.com/MRhagz/Kumpas/actions/runs/42671850406), [notes](https://github.com/MRhagz/Kumpas/actions/runs/42671850174) and [extraction](https://github.com/MRhagz/Kumpas/actions/runs/42671850170).

The maintenance runner records numeric HTTP status for rejected requests or invalid JSON responses while excluding credentials and response bodies. All eight maintenance regressions and scoped lint pass. Deployed malformed-JSON preflight requests return 401 without credentials and 400 with the existing private local credentials, without executing cleanup.

## Hosted cleanup verification

| Check | Verified result |
| --- | --- |
| Session/PDF cleanup | [Run 42738143875](https://github.com/MRhagz/Kumpas/actions/runs/42738143875) passes with both `session_cleanup` and `report_cleanup` successful. |
| Expired records and objects | Two expired session payloads and 62 expired PDFs cleared. Zero expired report versions, raw cleanup rows, report cleanup rows or expired uploads remain. |
| Valid data | 25 unexpired session payloads and 11 unexpired report versions remain; the eleven corresponding private objects remain. |

The system completes authenticated session and PDF cleanup through GitHub Actions. Read-only database and Storage verification confirms empty cleanup queues and preservation of unexpired records. The [correction-log schedule](https://github.com/MRhagz/Kumpas/actions/runs/42677620383) and [operational-log schedule](https://github.com/MRhagz/Kumpas/actions/runs/42610038765) also report success.

## Verified live results

The system extracts all 120 expected observations correctly across the thirty-document corpus. The recorded notes-only production browser workflow reaches draft PDF readiness in 79.905 seconds with all three specialists successful. The recorded specialist diagnostic completes in 17.943 seconds. Each result retains its measurement identity in the linked evidence.

## Evidence and system contracts

The [document inventory](verification-inventory.md) lists every source document reviewed. The [current machine-readable results](evidence/verification-2026-11-10.json) record execution methods, test counts, corpus hash, log hashes and execution outcomes. Verified live extraction measurements are recorded in [live evidence](evidence/sw-31-live-summary.json); the specialist/browser diagnostic remains in [diagnostic evidence](evidence/sw-31-current-specialists.json).

The system requirements and design are specified in [SRS](SRS_clean.md) and [SDD](SDD_clean.md). Runtime measurement and recovery procedures are specified in [SW-30](sw-30-runtime.md), [SW-23](sw-23-verification.md) and the [operations guide](sw-31-operator-handoff.md).

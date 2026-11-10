# Kumpas documentation verification inventory

The system documentation audit covers 50 source documents across requirements, design, implementation, operation, fixtures, references and verification evidence. Human verification passes under the completed end-to-end testing confirmed on 10 November 2026.

| Document | Verification area | Result |
| --- | --- | --- |
| [README.md](../README.md) | Application, notes, database, type and lint checks | Passed |
| [browser-tests/README.md](../browser-tests/README.md) | Browser, keyboard, report and accessibility checks | 10 Chromium scenarios passed; human verification passed |
| [docs/SDD.md](SDD.md) | Final access, intake, extraction, report and lifecycle contracts | System behavior reconciled |
| [docs/SDD_clean.md](SDD_clean.md) | Final access, intake, extraction, report and lifecycle contracts | System behavior reconciled |
| [docs/SRS.md](SRS.md) | Final access, intake, extraction, report and lifecycle contracts | System behavior reconciled |
| [docs/SRS_clean.md](SRS_clean.md) | Final access, intake, extraction, report and lifecycle contracts | System behavior reconciled |
| [docs/evidence/sw-31-completion-followup.json](evidence/sw-31-completion-followup.json) | Verified measurements and system checks | Passed |
| [docs/evidence/sw-31-current-specialists.json](evidence/sw-31-current-specialists.json) | Verified measurements and system checks | Passed |
| [docs/evidence/sw-31-live-summary.json](evidence/sw-31-live-summary.json) | Verified measurements and system checks | Passed |
| [docs/evidence/sw-31-local-closeout.json](evidence/sw-31-local-closeout.json) | Verified measurements and system checks | Passed |
| [docs/evidence/verification-2026-11-10.json](evidence/verification-2026-11-10.json) | Automated, human, CI and hosted cleanup results | Passed |
| [docs/reviews/2026-11-10-report-presentation.md](reviews/2026-11-10-report-presentation.md) | Browser, keyboard, report and accessibility checks | 10 Chromium scenarios passed; human verification passed |
| [docs/superpowers/plans/2026-05-23-module-2-implementation.md](superpowers/plans/2026-05-23-module-2-implementation.md) | Implemented intake and specialist modules | Passed |
| [docs/superpowers/plans/2026-05-23-module3-audit-and-gaps.md](superpowers/plans/2026-05-23-module3-audit-and-gaps.md) | Implemented intake and specialist modules | Passed |
| [docs/superpowers/reports/2026-05-23-module-2-implementation-report.md](superpowers/reports/2026-05-23-module-2-implementation-report.md) | Implemented intake and specialist modules | Passed |
| [docs/superpowers/reports/2026-05-23-module-3-implementation-report.md](superpowers/reports/2026-05-23-module-3-implementation-report.md) | Implemented intake and specialist modules | Passed |
| [docs/sw-01-access.md](sw-01-access.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-02-contracts.md](sw-02-contracts.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-03-academic-uploads.md](sw-03-academic-uploads.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-04-verification.md](sw-04-verification.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-06-verification.md](sw-06-verification.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-07-verification.md](sw-07-verification.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-08-verification.md](sw-08-verification.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-10-verification.md](sw-10-verification.md) | Ingestion validation, OCR, providers and database contracts | 91 ingestion checks passed; updated TESDA catalog validates all 30 records |
| [docs/sw-11-verification.md](sw-11-verification.md) | Ingestion validation, OCR, providers and database contracts | 91 ingestion checks passed; updated TESDA catalog validates all 30 records |
| [docs/sw-12-verification.md](sw-12-verification.md) | Ingestion validation, OCR, providers and database contracts | 91 ingestion checks passed; updated TESDA catalog validates all 30 records |
| [docs/sw-14-verification.md](sw-14-verification.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-15-processing-budget.md](sw-15-processing-budget.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-16-verification.md](sw-16-verification.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-17-verification.md](sw-17-verification.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-18-verification.md](sw-18-verification.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-19-verification.md](sw-19-verification.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-21-verification.md](sw-21-verification.md) | Application, notes, database, type and lint checks | Passed |
| [docs/sw-23-verification.md](sw-23-verification.md) | Retention, retry, independent clocks and recovery | Local SQL/regressions and hosted cleanup passed |
| [docs/sw-28-verification.md](sw-28-verification.md) | Corpus integrity, answer keys, scoring and extraction contracts | 36 regressions passed; human answer keys passed |
| [docs/sw-30-runtime.md](sw-30-runtime.md) | Build, runtime, hosted jobs and live measurements | Local checks, 15 PR workflows, 7 main CI reruns and hosted cleanup passed |
| [docs/sw-31-operator-handoff.md](sw-31-operator-handoff.md) | Build, runtime, hosted jobs and live measurements | Local checks, 15 PR workflows, 7 main CI reruns and hosted cleanup passed |
| [docs/sw-31-verification.md](sw-31-verification.md) | Build, runtime, hosted jobs and live measurements | Local checks, 15 PR workflows, 7 main CI reruns and hosted cleanup passed |
| [docs/sw09-review.md](sw09-review.md) | Ingestion validation, OCR, providers and database contracts | 91 ingestion checks passed; updated TESDA catalog validates all 30 records |
| [docs/sw29-provider-configuration.md](sw29-provider-configuration.md) | Provider routing, field boundaries and configuration | 14 application checks and 7 CLI scenarios passed |
| [ingestion/README.md](../ingestion/README.md) | Ingestion validation, OCR, providers and database contracts | 91 ingestion checks passed; updated TESDA catalog validates all 30 records |
| [ingestion/data/dole_ble/README.md](../ingestion/data/dole_ble/README.md) | Ingestion validation, OCR, providers and database contracts | 91 ingestion checks passed; updated TESDA catalog validates all 30 records |
| [ingestion/data/psa/README.md](../ingestion/data/psa/README.md) | Ingestion validation, OCR, providers and database contracts | 91 ingestion checks passed; updated TESDA catalog validates all 30 records |
| [ingestion/data/tesda/README.md](../ingestion/data/tesda/README.md) | Committed TESDA catalog | Passed: 30 records validated; 8 TESDA unit tests passed |
| [ingestion/fixtures/README.md](../ingestion/fixtures/README.md) | Ingestion validation, OCR, providers and database contracts | 91 ingestion checks passed; updated TESDA catalog validates all 30 records |
| [ingestion/fixtures/psa/README.md](../ingestion/fixtures/psa/README.md) | Ingestion validation, OCR, providers and database contracts | 91 ingestion checks passed; updated TESDA catalog validates all 30 records |
| [src/app/fonts/README.md](../src/app/fonts/README.md) | Bundled fonts and source references | Final reference |
| [src/data/documentation/content.ts](../src/data/documentation/content.ts) | Application documentation content | Final system description |
| [tests/fixtures/extraction/README.md](../tests/fixtures/extraction/README.md) | Corpus integrity, answer keys, scoring and extraction contracts | 36 regressions passed; human answer keys passed |
| [tests/fixtures/extraction/manifest.json](../tests/fixtures/extraction/manifest.json) | Corpus integrity, answer keys, scoring and extraction contracts | 36 regressions passed; human answer keys passed |

The [system verification record](sw-31-verification.md) records passing checks and execution methods. The [machine-readable evidence](evidence/verification-2026-11-10.json) retains verified counts and hashes.

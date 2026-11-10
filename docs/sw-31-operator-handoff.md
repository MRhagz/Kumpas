# Kumpas operations

The system uses private server credentials, scoped ingestion authorization and separate maintenance capabilities. Credentials remain in Vercel/GitHub environment settings or ignored private files.

## Configuration

| Setting | System use |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public project connection and counselor authentication |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only authorized workflow and private-artifact operations |
| `DOCUMENT_INTAKE_API_KEY` | Approved paid-provider extraction |
| `ACADEMIC_AUDITOR_API_KEY`, `INDUSTRY_ANALYST_API_KEY`, `FEASIBILITY_STRATEGIST_API_KEY`, `SYNTHESIS_API_KEY` | Separate server-side analysis capabilities |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_INGESTION_TOKEN`, `GEMINI_API_KEY` | Scoped public-source ingestion; worker JWT requires the `ingestion_worker` role and an unexpired token |
| `INGESTION_LOG_MAINTENANCE_DATABASE_URL` | Dedicated database login restricted to operational-log pruning |
| `SESSION_CLEANUP_SECRET`, `REPORT_RETENTION_SECRET` | Separate lifecycle endpoint credentials matched between application and maintenance environment |
| `KUMPAS_APP_URL` | Canonical HTTPS origin used by maintenance |
| `PSA_SOURCE_URL` | Official PSA table reference retained independently of the local CSV path |
| `NEXT_PUBLIC_SCHOOL_PRIVACY_CONTACT` | Institution-approved public contact |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Private protected-preview test access when that hosting method is used; application authentication remains required |

Human project, institutional and counselor-account verification pass. The deployed application uses the approved billing-enabled Gemini project. Application retention and provider retention are separate controls.

## Maintenance

The system runs session/PDF maintenance every 15 minutes with nonoverlapping production executions. Session and PDF cleanup have separate bounded budgets. Transient HTTP conditions receive one bounded retry; completion requires authorized responses and clear warning and backlog checks. Correction-log and operational-log pruning use their independent schedules.

The system passes hosted session/PDF cleanup with GitHub maintenance credentials matching the deployed application. [Run 42738143875](https://github.com/MRhagz/Kumpas/actions/runs/42738143875) clears the expired backlog and both cleanup queues. Twenty-five unexpired session payloads and eleven unexpired reports remain. Correction-log and operational-log schedules report success. All fifteen PR workflows pass on `14cf1f9`; all seven main-branch verification workflows pass for the `a3ab271` commit. Run links and automated results are in [system verification](sw-31-verification.md).

The updated TESDA CSV includes provider names and locations for all thirty records and passes validation. All eight TESDA unit tests pass. Cost columns retain national scholarship schedule benchmarks; provider/location fields identify registered program offerings. Validation performs no hosted import. The committed PSA CSV passes validation with thirteen records.

## Recovery

The system restores only into an isolated target, using the current deletion ledger independently of older backups and a separate private Storage snapshot. Expired or terminated data remains inaccessible while payloads and queued artifacts are removed. The [restore procedure](sw-23-verification.md#restore-procedure-std-s10) specifies the executable steps.

The system records approval-to-PDF timing through the [P01/P02 runner](sw-30-runtime.md#repeatable-p01p02-measurement), with identified deployments, workloads and server conditions.

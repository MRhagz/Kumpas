# SW-31 operator handoff

Checked 9 November 2026. Never paste credentials into issues, PRs or chat. Use the
named GitHub environment secrets, Vercel settings or an ignored private env file.

## Credentials and access

| Setting | Location | Observed status / required action |
| --- | --- | --- |
| `SUPABASE_URL`, `GEMINI_API_KEY` | GitHub repository secrets, inherited by `ingestion` | Names present. The importer still needs the two scoped settings below. |
| `SUPABASE_PUBLISHABLE_KEY` | GitHub `ingestion` environment secret | Configured with the project's existing active publishable key on 9 November. This is the public gateway key, not the worker's authorization token. |
| `SUPABASE_INGESTION_TOKEN` | GitHub `ingestion` environment secret | Missing. The deployment owner must supply a project-signed JWT with `role: ingestion_worker` and a bounded future `exp`, then arrange rotation before expiry. Keep its signing credentials outside CI and the application. Never substitute a service-role token. |
| `INGESTION_LOG_MAINTENANCE_DATABASE_URL` | GitHub `maintenance` environment secret | Missing. Supply a TLS connection for a dedicated database LOGIN with only membership in `ingestion_log_maintenance` and required connection/schema access. The existing group role is NOLOGIN; its name alone is not a connection credential. Verify the login can execute `public.prune_ingestion_logs()` and cannot access student tables or private Storage. |
| `SESSION_CLEANUP_SECRET`, `REPORT_RETENTION_SECRET` | Vercel server environment and matching GitHub `maintenance` secrets | Both GitHub secret names are present; the existing private operator record contains them. Preserve separate values and verify they match the deployed app. |
| `KUMPAS_APP_URL` | GitHub `maintenance` environment variable | Present. Use the canonical deployed HTTPS application origin. This is not a secret. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel app / private local env | Present locally; authenticated preview access and live Storage checks succeed. The service key stays server-only. |
| `DOCUMENT_INTAKE_API_KEY`, `ACADEMIC_AUDITOR_API_KEY`, `INDUSTRY_ANALYST_API_KEY`, `FEASIBILITY_STRATEGIST_API_KEY`, `SYNTHESIS_API_KEY` | Vercel app / private local env | Present locally. Actual preview extraction succeeds. Specialist health and performance remain separate qualification gates. Preserve the approved paid project/model. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Private test-runner environment, if using header-based preview access | Existing authorized bypass works. Optional for the runtime. The live-contract runner applies it to owner, other-owner and anonymous requests alike; app authentication remains enforced. Browser workloads can instead use existing authorized hosting cookies in private storage state. |
| Vercel project/API access | Existing deployment-owner CLI login | The expired cached token initially returned HTTP 403. The official CLI refreshed the existing login successfully, and scoped deployment inspection works. No replacement token is needed. Genuine cold-server evidence remains separate; a fresh browser is not a cold server. |
| Synthetic counselor accounts | Private operator auth/storage-state files | Five existing invited, activated accounts successfully accessed the SW-31 preview. Refresh private states when needed. Do not commit passwords, cookies or session IDs. |
| `NEXT_PUBLIC_SCHOOL_PRIVACY_CONTACT` | Vercel public app configuration | The institution must confirm the actual published contact and policy. This value is intentionally public. |

To add an owner-provided credential from a private file containing only its value:

```sh
gh secret set SUPABASE_INGESTION_TOKEN --repo MRhagz/Kumpas --env ingestion < /private/path/ingestion-token
gh secret set INGESTION_LOG_MAINTENANCE_DATABASE_URL --repo MRhagz/Kumpas --env maintenance < /private/path/maintenance-url
```

The scoped roles already exist in the hosted database and have no BYPASSRLS.
Provisioning a login or signing a worker token is an operator credential action,
not an application migration. See [SW-27 provisioning](../ingestion/README.md#operational-privacy-and-deployment-sw-27).
No new Gemini key or broader credential fallback is required by this follow-up.

## Execution order

1. Get complete browser CI on the final commit, then record its exact Vercel
   deployment identity. Keep any failed diagnostic attempts in the evidence.
2. Run the remaining live R01/R03 checks and frozen extraction comparison.
   Protected-preview API tests need hosting access for the anonymous actor too.
   Set `VERCEL_AUTOMATION_BYPASS_SECRET` only in the private runner environment
   if that actor has no hosting cookie; do not put it in the manifest or output.
3. Freeze the public knowledge snapshot and prevent ingestion overlap. Prepare
   fresh synthetic drafts and run [P01/P02](sw-30-runtime.md#repeatable-p01p02-measurement),
   recording specialist status and all partial/failing attempts. Obtain genuine
   cold-server evidence from the deployment owner.
4. After performance measurements, verify actual ingestion and maintenance
   schedules, failure-notification receipt, elapsed retention boundaries and
   synthetic failed-deletion/retry/idempotence drills. Do not use a global
   production cleanup as a substitute for an isolated failure drill.
5. Obtain independent DEF-001–007 retests, human extraction answer-key review,
   the qualified counselor's twenty-case explanation review, actual Safari and
   spoken screen-reader evidence, and institutional privacy/contact verification.
6. Update the 40-row disposition and acceptance evidence. Human approval,
   required passing checks and merge precede Done.

SW-05 masking waivers and SW-30's isolated hosted S10/RPO/RTO exclusion remain
in effect. Post-midterm stakeholder studies remain scheduled separately.

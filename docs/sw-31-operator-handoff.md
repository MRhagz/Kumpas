# SW-31 operator handoff

Checked 9 November 2026. Never paste credentials into issues, PRs or chat. Use the
named GitHub environment secrets, Vercel settings or an ignored private env file.

Current user scope: hosted verification and human review are explicitly skipped
for this local closeout. Do not request Vercel access or independent reviewer
approval to finish its automated local checks. Earlier access and acceptance
requirements below describe the original full qualification, which is not
claimed by this reduced scope. The [current verification record](sw-31-verification.md#current-user-scope--9-november-2026)
tracks the decision; skipped checks do not become passing evidence.

Local closeout is successful: 791 application tests, 28 notes tests, four metric
tests, two Chrome fixture workflows and six complete axe scans pass. Build,
TypeScript and runtime checks pass; lint has zero errors and twelve existing
warnings. The user accepted the local result with hosted verification, human
review and extended live-provider verification excluded. No additional provider run or human approval is
needed to finish this reduced scope. See [the final evidence](evidence/sw-31-local-closeout.json)
for the verified results and Supabase MCP's zero-artifact cleanup readback.
The retention-workflow merge conflict is resolved locally; the merge awaits the
user's commit and push. PR and tracker state are unchanged.

Earlier current-environment checkpoint: the supplied existing counselor account
authenticates successfully. All three specialists and a complete synthetic
browser/PDF workflow pass against the local production build using live services
([results](evidence/sw-31-current-specialists.json)). The current-head hosted
preview still returns HTTP 302 to Vercel SSO, and the inspected CLI auth files
have no active token in this environment. Full hosted diagnosis would require
the existing authorized Vercel login or automation bypass through an ignored
private env file; it is outside the current closeout. The earlier successful CLI refresh
below is historical; it does not establish current access. Do not rotate keys
or change protection settings to work around this checkpoint.

## Credentials and access

| Setting | Location | Observed status / required action |
| --- | --- | --- |
| `SUPABASE_URL`, `GEMINI_API_KEY` | GitHub repository secrets, inherited by `ingestion` | Names present. The importer still needs the two scoped settings below. |
| `SUPABASE_PUBLISHABLE_KEY` | GitHub `ingestion` environment secret | Configured with the project's existing active publishable key on 9 November. This is the public gateway key, not the worker's authorization token. |
| `SUPABASE_INGESTION_TOKEN` | GitHub `ingestion` environment secret | Configured 9 November. Hosted DOLE ingestion validates the worker JWT and processes all three PDFs successfully (604 unchanged chunks). Rotate before its expiry; keep signing credentials outside CI and the application. |
| `INGESTION_LOG_MAINTENANCE_DATABASE_URL` | GitHub `maintenance` environment secret | Configured 9 November. The dedicated `kumpas_log_maintenance` login can execute pruning and cannot read student sessions or Storage. The main workflow fails because a connection URI in `PGDATABASE` is not expanded; this branch passes it explicitly with `--dbname`. Actual connection/password verification remains pending execution of the corrected workflow. |
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

Credential verification on 9 November: [DOLE run 42575789219](https://github.com/MRhagz/Kumpas/actions/runs/42575789219)
passes with three PDFs, zero failed files and 604 unchanged chunks. The
[PSA run](https://github.com/MRhagz/Kumpas/actions/runs/42575765799) authenticates
and writes its sanitized failure log, then rejects the missing `PSA_SOURCE_URL`.
Its bundled CSV is documented as illustrative; the operator must supply verified
data and its official table URL before a live refresh. The
[maintenance run](https://github.com/MRhagz/Kumpas/actions/runs/42575755668) fails
before credential validity can be established. A direct libpq check with dummy
credentials reproduces the URI/default-socket problem and verifies the explicit
dbname fix. No logs met the 90-day deletion cutoff at the preflight check.

## Original full-qualification execution order

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

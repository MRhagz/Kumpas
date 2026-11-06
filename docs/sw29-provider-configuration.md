# SW-29 provider configuration and data boundaries

Record date: 5 November 2026. Requirements: KMP-NFR-002/003/016; provider-related
portions of STD S07, S11 and A01. This is the implementation/setup record, not a plan.

> Current intake flow: SW-05 now waives local masking. SW-06 sends approved academic uploads and prepared note photographs directly through the existing paid-provider configuration, saves editable drafts and cleans up temporary artifacts. The redaction-specific statements below describe the historical SW-29 implementation; see [SW-06 verification](sw-06-verification.md) for current behavior. Completed SW-29 work is not reopened.

## Approved settings and evidence

| Setting | Value / evidence |
| --- | --- |
| Generation and extraction | `gemini-3.8-flash`, selected by the user on 5 November 2026 |
| Gemini API | Google Gemini Developer API, fixed HTTPS origin `generativelanguage.googleapis.com`, `v1beta` |
| Embeddings | `gemini-embedding-001`, 768 dimensions; `RETRIEVAL_DOCUMENT` for ingestion and `RETRIEVAL_QUERY` for queries |
| Project/billing | User confirmed all Gemini keys belong to one Google Cloud project with billing enabled on 5 November 2026 |
| Project name/ID | Not supplied; not independently inspected |
| Billing console evidence | User confirmation recorded; screenshot/export not supplied |
| Optional logging/data-sharing controls | Not inspected; no claim that an unavailable control is enabled |
| Account-setting verifier | To be recorded with console evidence |

No extra project or key consolidation is required. Keep the existing per-operation
keys (`DOCUMENT_INTAKE_API_KEY`, specialist keys, `SYNTHESIS_API_KEY`) server-side.
The ingestion `GEMINI_API_KEY` belongs to the same approved project. Configure
secrets through Vercel/GitHub Actions, never in tracked examples or evidence.
Do not include actual keys, signed URLs, student files or confidential notes in
screenshots, logs or reports. No hosted account settings were changed by SW-29.

## Provider terms

Reviewed [Gemini terms](https://aistudio.google.com/docs/terms) on 5 November 2026
(page effective date: 23 March 2026). Paid API access requires a project linked
to active billing. Paid prompts/responses are not used to improve Google's
products. The terms describe limited prompt/response logging for safety/security
and stated disclosure purposes; paid service is not a zero-retention guarantee.
Record actual available account controls rather than asserting a retention switch
exists. Application expiry/deletion does not prove deletion at the provider.
Recheck terms and the project record when deploying or changing configuration.

Model capabilities: [Gemini 3.8 Flash](https://aistudio.google.com/docs/models/gemini-3.8-flash).
Key handling: [Gemini API keys](https://aistudio.google.com/docs/api-key).
The STD's Gemini 3.6 Flash record describes a historical test build; it is not
evidence that this model change passed the same live tests.

## Permitted outbound data

| Operation / recipient | Permitted content | Exclusions / enforcement |
| --- | --- | --- |
| Academic extraction / Gemini | Task prompt and redacted academic image | No filename, counselor/session ID, logs or database object in request; SW-05 owns image redaction |
| Notes extraction / Gemini | Prepared, reviewed interview-summary image and five-field prompt | Existing `notesReviewed` confirmation remains required; SW-05 owns image redaction |
| Academic specialist / Gemini | Selected grades, NCAE/NAT fields, reviewed career goal/interests and relevant public evidence | Academic objects are projected into documented fields; session metadata, unrelated notes and correction logs excluded |
| Industry specialist / Gemini | Reviewed career goal/interests, applicable strand, public labor evidence | Financial notes, concerns and overall impression excluded |
| Feasibility specialist / Gemini | Reviewed career goal/interests, necessary financial context, relevant academic scores and public cost/scholarship evidence | Concerns, overall impression and whole profile excluded |
| Query embedding / Gemini | Task-specific academic/career search terms | Financial narrative, concerns, overall impression and whole profile excluded |
| Synthesis / Gemini | Selected specialist findings and public source references | Unexpected specialist response properties and raw error bodies excluded |
| Ranking explanation / Gemini | Career options, scores and selected evidence signals | Whole student profile and operational records excluded |
| Ingestion embedding / Gemini | Validated public government document/CSV chunks | Student profiles, notes, correction logs and application records are not pipeline inputs |
| Knowledge retrieval / Supabase | Query vector, silo and embedding contract | No raw student text in the vector search RPC |

Academic extraction and notes responses retain documented fields only. Academic
extraction no longer writes the complete provider response into its database insert.
These changes do not scrub pre-existing stored data; retention/cleanup remains with
its assigned tasks. Field selection cannot detect identifiers embedded in allowed
free text or prove that image pixels have been redacted.

SW-05 has not started. Existing image PII detection still uses Gemini before
masking, and the direct image routes do not establish local pre-send redaction.
SW-29 does not certify those paths for real student content. Its E2E checks use
synthetic images only; integrated redaction and raw-deletion verification remain
with SW-05/SW-28. This limitation does not block independent configuration work.

## Runtime/setup contract

Use the root and ingestion `.env.example` files as templates. The application
validates keys, approved model/API settings, embedding compatibility, secret
variable naming and the Supabase HTTPS URL in its Node instrumentation hook.
It exits on invalid configuration. Pure static analysis needs no real secrets;
builds need nonempty synthetic placeholders for existing Supabase imports.
Live runtime operations require valid project keys. Never use production keys
for the E2E fixture runner.

REST authentication uses `x-goog-api-key`; the SDK is configured explicitly for
the same Gemini HTTPS origin/API version. Image calls and document embeddings
reject redirects; public-source ingestion checks HTTPS on redirects too.
Image calls omit deprecated sampling parameters, and response parsing reads
non-thought text parts rather than assuming the first part is the final answer.
Supabase uses HTTPS, with loopback HTTP permitted only for explicit development.
Gemini client/configuration modules are server-only. Error responses and provider
diagnostics omit raw bodies, URLs containing keys and exception causes.

## Verification

Focused E2E commands (synthetic external services):

```sh
node scripts/provider-e2e.mjs
python scripts/ingestion-provider-e2e.py
```

The Node runner builds the actual Next.js app, starts production HTTP servers,
and replaces only external HTTP services in the test process. It checks invalid
startup, denied callers, reviewed notes, extraction, the complete analysis path,
payload markers, provider/malformed-response failures and browser assets. For an
unchanged successful build, `--skip-build` reruns only HTTP scenarios.
The Python runner needs the ingestion package installed and executes the complete
TESDA CLI with external HTTP fixtures, including header-authenticated embedding,
transactional refresh submission, failure behavior and rejected configurations.
These are not live Gemini, deployed TLS, browser interaction, database-policy or
full STD case passes. No new unit tests are included.

Results on 5 November 2026:

| Check | Actual result |
| --- | --- |
| `node scripts/provider-e2e.mjs` | PASS: production build plus 13 HTTP/startup/bundle scenarios (14 checks total), including session upload and complete analysis |
| `/tmp/kumpas-sw29-venv/bin/python scripts/ingestion-provider-e2e.py` | PASS: 7 complete CLI scenarios; synthetic provider/database HTTP fixtures |
| TypeScript | PASS: `tsc --noEmit --pretty false`; final production build also passed TypeScript |
| Scoped ESLint | PASS: changed application TypeScript and JavaScript E2E files |
| Python syntax compilation | PASS: changed ingestion sources and CLI fixture scripts |
| `git diff --check` | PASS |

No existing unit suites were run. No live Gemini calls, hosted Supabase writes,
provider account changes, deployment or tracker mutations were performed.
Production model behavior, deployed TLS and console settings remain unverified;
the account/billing confirmation above is explicitly user-supplied evidence.

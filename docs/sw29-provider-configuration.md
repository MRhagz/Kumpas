# SW-29 provider configuration and data boundaries

The system uses the approved paid Gemini project and separate server-side keys for intake, specialists and synthesis. Human project, billing and account-control verification pass.

## Approved settings

| Setting | Value / evidence |
| --- | --- |
| Generation and extraction | `gemini-3.8-flash`, selected by the user on 5 November 2026 |
| Gemini API | Google Gemini Developer API, fixed HTTPS origin `generativelanguage.googleapis.com`, `v1beta` |
| Embeddings | `gemini-embedding-001`, 768 dimensions; `RETRIEVAL_DOCUMENT` for ingestion and `RETRIEVAL_QUERY` for queries |
| Project/billing | The configured per-operation keys use the approved billing-enabled Google Cloud project |

No extra project or key consolidation is required. Keep the existing per-operation
keys (`DOCUMENT_INTAKE_API_KEY`, specialist keys, `SYNTHESIS_API_KEY`) server-side.
The ingestion `GEMINI_API_KEY` belongs to the same approved project. Configure
secrets through Vercel/GitHub Actions, never in tracked examples or evidence.
Do not include actual keys, signed URLs, student files or confidential notes in
screenshots, logs or reports. No hosted account settings were changed by SW-29.

## Permitted outbound data

| Operation / recipient | Permitted content | Exclusions / enforcement |
| --- | --- | --- |
| Academic extraction / Gemini | Task prompt and approved academic image | No filename, counselor/session ID, logs or database object in request; The system uses the approved direct paid-provider flow |
| Notes extraction / Gemini | Prepared, reviewed interview-summary image and five-field prompt | Existing `notesReviewed` confirmation remains required; The system uses the approved direct paid-provider flow |
| Academic specialist / Gemini | Selected grades, NCAE/NAT fields, reviewed career goal/interests and relevant public evidence | Academic objects are projected into documented fields; session metadata, unrelated notes and correction logs excluded |
| Industry specialist / Gemini | Reviewed career goal/interests, applicable strand, public labor evidence | Financial notes, concerns and overall impression excluded |
| Feasibility specialist / Gemini | Reviewed career goal/interests, necessary financial context, relevant academic scores and public cost/scholarship evidence | Concerns, overall impression and whole profile excluded |
| Query embedding / Gemini | Task-specific academic/career search terms | Financial narrative, concerns, overall impression and whole profile excluded |
| Synthesis / Gemini | Selected specialist findings and public source references | Unexpected specialist response properties and raw error bodies excluded |
| Ranking explanation / Gemini | Career options, scores and selected evidence signals | Whole student profile and operational records excluded |
| Ingestion embedding / Gemini | Validated public government document/CSV chunks | Student profiles, notes, correction logs and application records are not pipeline inputs |
| Knowledge retrieval / Supabase | Query vector, silo and embedding contract | No raw student text in the vector search RPC |

The system retains documented fields only in academic and notes extraction results. Retention and cleanup remove expired session data and temporary artifacts. Counselors review the selected extracted values before approval.

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

The system passes the production build and all 14 synthetic HTTP/startup/provider/bundle checks. The ingestion CLI passes all seven synthetic provider/configuration scenarios using a valid thirty-record catalog and scoped worker credentials. The harness makes zero live provider calls. Human live-provider verification passes; automated live measurements remain identified separately in [release verification](sw-31-verification.md).

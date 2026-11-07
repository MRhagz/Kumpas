# SW-18 — Cited evidence summaries

## Baseline and scope

Branch `codex/sw-18` starts at fetched/rechecked main `1e5f9d2818fcbe0f5ffe91548323560d549f6ada` (7 November 2026), including SW-17 PR #66. The [team tracker](https://kumpas-team-tracker.jrvnryle.chatgpt.site/) marks SW-17 Done and already assigns SW-18 to Peeps in progress; that claim is retained. No prerequisite waiver or task split is used. Existing untracked `output/` artifacts were preserved.

Read the current approved Drive [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view) Scope, Module 3.2, Module 4.1 and Data Recency; [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view) RankingAgent, ReasoningSummaryFormatter, AuditTrailBuilder, report contract and cross-cutting privacy/retry rules; [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view) §3.10 F10, §3.41 R03 and KMP-DEF-002; [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view) KMP-FR-012/014 and KMP-NFR-012; and [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view) Findings 2–3. Source downloads were reviewed; older repository document copies were not treated as authoritative. Also checked the installed Next 16.2.6 Route Handlers reference, repository Supabase/Postgres guidance, current Supabase changelog and relevant table/insert documentation.

SW-05's paid-tier extraction exception remains in effect. No local pre-upload masking, model/configuration change, deferred RTM feature or submission document/PDF edit is included. Full two-audience report design remains SW-19.

## Contract and behavior

The ranking prompt requests structured evidence summaries with actual input/source references. It does not request internal reasoning. The model returns the supported dimensions and citations; the server validates exact membership and constructs concise statements of the comparative score and its reviewed evidence. Arbitrary model narrative, extra fields and provider thought parts are discarded. Unknown careers, missing/duplicate claims and unsupported input, URL, chunk or silo citations cannot become published explanations. Scoring, fixed weights, deterministic ranks, shared deadlines and bounded retries remain unchanged.

This deliberately limits automatic factual assertions: statements identify the evidence supporting the AI-proposed component comparison, rather than inventing labor-market facts or reproducing specialist narratives. Reference membership does not prove that a proposed score is semantically correct. Source interpretation, conflicting evidence, suitability and the required qualified-counselor review remain human acceptance work.

Synthesis output prose is not trusted as a student explanation. Component explanations and key signals are reconstructed from validated references, with generic labels for financial/concern context and an explicit self-reported-interest limitation. Raw note values are absent from the explanation prompt. Persistence also rejects arbitrary summary prose. Existing stored free-text explanations are withheld on cached analysis and report reads; missing explanations remain unavailable. Existing scores and supported partial comparisons remain usable.

Provenance retains silo, source reference, chunk index, official public URL when supplied, publication date, ingestion timestamp and acquisition method. Equal URL/chunk values in different silos retain their own metadata. Unknown/invalid/legacy epoch dates remain null, and no missing date is replaced by generation time. Missing dates, missing academic documents and partial dimensions are explicit in UI/PDF. Full source URLs, dates and approved input references appear in a paginated counselor-review reference section; UI links retain query strings and fragments.

The approved documents define refresh schedules but no individual-source expiration rule. Currency is therefore explicitly unverified, with a warning to check for outdated or superseding sources; an ingestion timestamp is not presented as proof of current publication or policy validity. No arbitrary age cutoff was introduced.

## Verification

Windows; Node `v22.16.0`, npm `10.9.2`. External providers use synthetic fixtures, and PostgreSQL schema/query checks execute in PGlite. No real student records or paid provider requests were used.

| Exact command | Outcome |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.ts --maxWorkers=2` | PASS: 39 files, 611 tests. |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.mts` | PASS: 2 files, 28 tests. |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | PASS, exit 0. |
| `node scripts/provider-e2e.mjs` | PASS: final production webpack build and 14 synthetic HTTP/configuration/payload checks; zero live provider calls. Run outside the filesystem sandbox because its Next prerender writes were blocked in the preceding SW-17 work. |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/evidence-provenance-storage.test.ts` | PASS: 2 tests, including the final silo metadata write/read check. |
| `git diff --check` | PASS. |

Changed-file lint passed (exit 0):

```powershell
node node_modules/eslint/bin/eslint.js src/lib/module3/ranking-agent.ts src/lib/module3/synthesis-interpreter.ts src/lib/module3/ranked-recommendation-builder.ts src/lib/module3/recommendation-provider.ts src/lib/module3/types.ts src/lib/report/evidence-summary.ts src/lib/report/reasoning-formatter.ts src/lib/report/audit-trail.ts src/lib/report/types.ts src/lib/report/pdf-renderer.ts src/app/api/reports/route.ts 'src/app/api/sessions/[sessionId]/analyze/route.ts' src/components/analysis/report-download-view.tsx tests/evidence-summaries.test.ts tests/evidence-provenance-storage.test.ts tests/alignment-scoring.test.ts tests/alignment-route.test.ts tests/partial-specialists.test.ts scripts/provider-e2e.mjs
```

42 added automated cases include 20 frozen evidence/score combinations, unsupported citations, duplicate/missing claims, confidential-note and raw-reasoning sentinels, provider thought parts, absent/invalid/older dates, conflicting source references, equal URL/chunk identities across silos, notes-only evidence, legacy/cached output withholding, metadata persistence and preservation of the ownership policy. Existing scoring/failure fixtures were updated only to supply the new explanation response contract; assertions for unchanged scores, ranks and partial behavior remain. Alignment CI includes the new cases.

Visual QA generated four synthetic PDFs (`balanced`, `missing-dates`, `conflicting-sources`, `notes-only-partial`) and inspected all 12 rendered pages after the final metadata changes. No clipping, overlap or epoch dates were observed. The same fixtures assert UI/PDF text, citation links and private/raw sentinel exclusion. Reproduction commands:

```powershell
$env:SW18_PDF_QA_DIR='C:/Users/smoll/Documents/ChatGPT/Kumpas/.tmp/sw18-pdf-qa'
node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/evidence-summaries.test.ts
foreach ($sw18Fixture in @('balanced','missing-dates','conflicting-sources','notes-only-partial')) {
  & 'C:/Users/smoll/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe' -r 90 -png ".tmp/sw18-pdf-qa/$sw18Fixture.pdf" ".tmp/sw18-pdf-qa/$sw18Fixture"
}
```

The final evidence fixture run passed 39 tests. Poppler exited 0 while reporting missing optional Symbol/ArialUnicode display fonts; the rendered Helvetica pages were visually checked. Vitest emits the existing future native-config-loader warning. Neither warning was suppressed by changing unrelated configuration.

## Migration and deployment

The CLI created `20261107071713_sw18_evidence_provenance.sql` with `node node_modules/supabase/dist/supabase.js migration new sw18_evidence_provenance`. It adds nullable publication date, public URL, chunk and silo metadata to `recommendation_sources`, drops the ingestion timestamp's NOT NULL/default-now behavior, and clears only the documented exact epoch sentinel. Ownership/RLS policies and grants are untouched. Existing versioned run JSON carries the same provenance. No historical publication/ingestion evidence is invented or backfilled.

Apply the additive migration before deploying the updated application so legacy table inserts can write the new metadata and null dates. Redeploy the normal Next application; no new environment variables or dependencies are required. Existing old explanations are withheld rather than reclassified as validated summaries. Existing stored PDFs are not rewritten by this PR. No hosted migration or production deployment was performed.

The initial CLI help attempt was blocked by its startup write to `~/.supabase/telemetry.json`; an approved rerun succeeded. These read-only local-stack checks were attempted and unavailable, both with connection refused at `127.0.0.1:54322`:

```powershell
node node_modules/supabase/dist/supabase.js db advisors --local --type security --fail-on error
node node_modules/supabase/dist/supabase.js migration list --local
```

The migration and actual metadata/ownership queries passed in PGlite. Hosted Supabase, deployed-browser/manual counselor workflows, paid Gemini outputs, production billing/privacy controls, the 20-case qualified-counselor review and full STD F10/R03 release acceptance were not exercised. These software fixtures do not claim those human acceptance results. Before Done, require human review, passing required remote checks and merge.

## Later document handoff

Reconcile the approved documents' SW-05 privacy/extraction language separately, replace stale implementation/evidence notes with the reviewed SW-17/18 contracts and actual deployment evidence, and record independent KMP-DEF-002 retesting. Qualified counselors must still review evidence interpretation and suitability under NFR-012. Full report audience separation/release gates and the integrated release evaluation stay with their assigned tasks. This PR moves SW-18 to review and does not mark it Done.

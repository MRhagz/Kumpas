# SW-16 deterministic alignment scoring — draft implementation

Baseline: fetched `origin/main` at `5694f06` on 5 November 2026. A concurrent task began changing the original checkout, so SW-16 was isolated on `sw-16-scoring` in `/private/tmp/kumpas-sw-16`. Existing work and workspace artifacts were preserved.

Read the current approved [SRS Module 3.2](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view), [SDD Module 3.2](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view), [STD F08/F09/U01/R02 and KMP-DEF-001/005](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view), [RTM KMP-FR-014/020](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view), and [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view) through connected Drive before editing. Relevant installed Next.js server/client guidance was read. Supabase changelog and documentation were consulted.

## Behavior

- Synthesis requests 0–100 components and validates model structures, finite numeric ranges, approved input field references, successful specialist attribution, and actual retrieved source URL/chunk pairs. Invalid scores are rejected, not clamped or coerced. Unsupported dimensions become null. Public source metadata comes from the retrieved records, rather than model-supplied provenance. Input references persist as paths without copying confidential note values.
- Aptitude requires approved academic or career-interest inputs. Demand requires IndustryAnalyst evidence, with AcademicAuditor PSA context accepted where supplied. Feasibility requires available financial/family-context inputs and FeasibilityStrategist sources. Missing specialists cannot be substituted by other specialists. These checks establish reference availability; they do not independently certify the semantic correctness of a model's interpretation.
- The calculator applies fixed 35/40/25 weights and rounds the total to two decimals before sorting. Equal totals share standard competition ranks (`1, 1, 3`) and display alphabetically using English collation. Explanation output can only supply explanation text, never components, totals, ranks or ordering.
- Missing components withhold the overall score and rank; weights are never redistributed. Supported partial comparisons appear after the scored paths, separately labeled in the UI/PDF. Fewer than three scored paths carry a limitation. Unsupported-only/empty results return actionable insufficient evidence (HTTP 422), mark analysis failed and never persist a successful report; Retry and End Session are offered.
- Evidence, applied weights and the available approved profile version persist with each recommendation. A legacy profile without a version remains explicitly null; this change does not claim to complete SW-02's downstream run/publication integration.
- UI/PDF formatting preserves two decimals rather than multiplying normalized scores or rounding to integer percentages. Reports state that scores compare supported options and are not probabilities of career success. Report validation accepts ties and partial/fewer-path results. Report sources retain the retrieved ingestion dates.

## SQL proposal and deployment blocker

**This branch is not deployable until the SQL proposal is packaged as a real migration.** `docs/sw16-scoring-migration.sql` is a reviewed/tested proposal, deliberately outside `supabase/migrations/` pending the migration-file exception. The storage tests execute that exact proposal against the existing Module 3 schema in embedded PostgreSQL.

The project's Supabase skill requires `supabase migration new` before creating a migration file. The installed v2.101.0 CLI and a complete cached v2.101.0 CLI both terminate with SIGKILL (including outside the sandbox). `codesign --verify --verbose /private/tmp/kumpas-sw14/node_modules/@supabase/cli-darwin-arm64/bin/supabase` reports an invalid signature. A fresh current CLI has the same startup failure; the attempted v2.72.7 download did not complete successfully. No signature/security bypass was attempted. Permission to directly author the conventional timestamped migration was requested and remains pending.

Once approved or a working CLI is available: create the migration using the SQL proposal; point `tests/alignment-storage.test.ts` at the migration rather than the proposal; rerun the checks; then make the PR ready for review. Do not apply this proposal manually to a hosted database as part of this draft.

The SQL permits nullable components/total/rank, records component evidence, weights and profile version, checks the fixed weighted total/range and partial consistency, and preserves old values under `legacy-0-1`. New writes explicitly use `0-100-v1`. Legacy recommendation rows are not relabeled or rescaled because their lost precision/support cannot be recovered. New report assembly rejects them and resume state requires current-contract recommendations so active sessions regenerate analysis. Already generated PDFs and storage objects are untouched.

Apply the completed migration before deploying the application; old code and the new schema must not be used to produce mixed-contract reports. No new secret or external provider is required. `APTITUDE_WEIGHT`, `DEMAND_WEIGHT` and `FEASIBILITY_WEIGHT` overrides no longer alter scoring: default weights are fixed and recorded. A future weight change requires documented rationale and a coordinated contract change. No hosted migration, deployment, submission PDF update, retention/access-policy change or deferred RTM feature is included.

## Verification

Commands run from `/private/tmp/kumpas-sw-16` unless noted:

- `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/alignment-scoring.test.ts` before implementation reproduced the original rounding, shared-rank and missing-component defects. The final focused suite has 32 passing tests, including malformed/out-of-range/nonfinite results, missing inputs/sources, failed specialists, duplicates, no supported path, and preservation of 84.50/79.45/71.55 through synthesis and storage assembly.
- `SW16_PDF_QA_DIR=/private/tmp/sw16-pdf-qa node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/alignment-scoring.test.ts tests/alignment-report.test.ts`: 35 passed. Rendered the synthetic PDF with installed `pdfjs-dist`/`@napi-rs/canvas` because Poppler was unavailable; inspected all three page images. Fixed and rechecked score-bar overlap and an orphaned partial heading. No submission PDFs were modified.
- `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/alignment-route.test.ts`: 2 passed; insufficient evidence returns 422 without success, and actual approved profile/version reach synthesis.
- `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/alignment-storage.test.ts`: 9 passed against the SQL proposal, including legacy preservation, ties, partial nulls, out-of-range/nonfinite scores and invalid totals. This is embedded PostgreSQL verification, not a hosted Supabase migration/advisor check.
- `node node_modules/vitest/vitest.mjs run --config vitest.config.ts --exclude tests/alignment-storage.test.ts`: final run 300 passed. `npm test`: 28 passed. Earlier runs encountered missing/incomplete dependency files; a complete cached dependency installation and the exact locked `pdfjs-dist@6.5.438` tarball restored them. No lockfile or dependency declaration changed.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: passed after restoring dependencies.
- Scoped ESLint over changed Module 3, report, session-state, API/UI files and `tests/alignment*.test.ts`: passed, zero warnings. `git diff --check`: passed.
- `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=sw16-public-test-key SUPABASE_SERVICE_ROLE_KEY=sw16-test-key npm run build`: passed outside the sandbox; all 19 static pages generated. The initial sandbox build failed because Turbopack could not bind its local CSS-processing port. Values used here are synthetic test configuration.

`npm run test:access`: 309 passed across 16 files, including the nine SQL-proposal tests. `npm run lint:access`, the final typecheck and `git diff --check`: passed. `npm test`: 28 passed. Total: 337 automated tests passing. The new alignment workflow runs the focused checks on pull requests; published CI results are recorded below when available.

No live Gemini/Supabase end-to-end run, counselor-operated browser session, hosted migration/advisors or independent STD R02 retest is claimed. No full F08/F09/U01/R02 acceptance or defect closure is claimed from automated portions alone.

## Tracker and review

The [team tracker](https://kumpas-team-tracker.jrvnryle.chatgpt.site/) was inaccessible: the computer-use browser host is unavailable, and the web read fallback also failed. Assignment confirmation or another accessible update method was requested. No claim, reassignment or status update was invented. The PR URL and verification summary still need to be put in the tracker after access is restored. Keep this PR draft until the migration blocker is resolved; then move to review. Done requires human review, passing required checks and merge into main.

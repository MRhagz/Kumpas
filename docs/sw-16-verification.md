# SW-16 deterministic alignment scoring

[PR #57](https://github.com/MRhagz/Kumpas/pull/57), branch `sw-16-scoring`. On 7 November 2026 (Asia/Manila), fetched and integrated main at `ebeca7f`. Work remains isolated in `/private/tmp/kumpas-sw-16`; unrelated work in the original checkout was preserved.

The original draft was based on `5694f06`. The final integration retains current main's immutable approved profiles, analysis-run ownership/deadlines/retries, private versioned PDFs, correction invalidation and draft recovery. The user authorized resolution of the migration-packaging blocker. The CLI still terminates with SIGKILL, so the tested SQL was directly packaged as `supabase/migrations/20261106161754_sw16_alignment_scoring.sql`. There is no remaining migration-file exception or uninstalled SQL proposal in `docs/`.

## Approved requirements

Read [SRS Module 3.2](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view), [SDD Module 3.2](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view), [STD F08/F09/U01/R02 and KMP-DEF-001/005](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view), [RTM KMP-FR-014/020](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view), and [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view) through connected Drive. Relevant installed Next.js guidance and Supabase's current changelog/table documentation were consulted. The new Flutter changelog does not affect this TypeScript/Postgres change; the CLI was not upgraded.

## Resulting behavior

- Model components are finite numbers on 0–100 or null. Malformed/out-of-range/coerced values are rejected, not clamped. Supporting references must name available approved fields and actual retrieved URL/chunk pairs from the appropriate successful specialist. Missing evidence withholds that dimension. Source metadata comes from retrieved records. Reference validation does not certify the semantic accuracy of a model's interpretation.
- Calculate 35% aptitude + 40% demand + 25% feasibility; round the total to two decimals before sorting. Equal totals share standard competition ranks (`1, 1, 3`) and use English alphabetical display order. Explanation output cannot change components, weights, totals, ranks or ordering.
- A missing component leaves total and rank null, with no zero-fill or redistributed weights. Partial comparisons appear separately in the UI/PDF. Fewer than three scored paths carry a limitation. No supported component in any candidate produces HTTP 422 with insufficient evidence and Retry/End Session, never successful publication.
- The immutable approved profile/version and existing shared run budget reach synthesis. New results include `scoreContract: "0-100-v1"`, component evidence, fixed weights and profile version in the run's JSON recommendations. The analysis route preserves main's atomic publication path and passes `persist=false`; it does not perform legacy per-session writes outside the versioned run.
- The legacy table is compatible with nullable partials and records the same metadata for callers that use its persistence path. Its constraints reject unsupported-only rows, invalid ranges, inconsistent partials, incorrect weights and wrong totals. RLS/grants are unchanged.
- Legacy table rows and saved run JSON are never relabeled or rescaled. Active drafts with legacy run results restart analysis using the existing approved profile. New report assembly rejects an unmarked legacy list. Existing stored PDFs are not rewritten; current main's report authorization, version and expiry checks remain intact.
- UI/PDF display scores to two decimals, disclose missing components and describe alignment as comparative evidence rather than a probability of career success. Grade 10/SHS counselor operation is retained. No submission PDFs or deferred RTM features are changed.

## Deployment

1. After human review and required passing checks, drain in-flight analysis/report work for the release so old workers cannot publish legacy scoring during the switch.
2. Apply `20261106161754_sw16_alignment_scoring.sql` through the deployment's normal migration runner after current main's existing migrations. It adds nullable metadata columns, drops NOT NULL on scores/rank, adds the contract marker and checks, and preserves existing rows under `legacy-0-1`. No row deletion, source rewrite, new grant, policy, function or trigger is introduced.
3. Deploy the matching application. New table writes explicitly set `0-100-v1`; the default stays legacy so an old writer cannot silently label its output as the new contract. The versioned production flow stores the marker and evidence with the run. Regenerate legacy active drafts before generating new reports.
4. Verify a supported 80/60/90 candidate displays 74.50, a rounded tie shares its rank in alphabetical order, missing feasibility remains unscored, and unsupported results offer Retry/End Session without a report. Use a counselor-owned synthetic session and the existing versioned report approval/download flow.

There are no new secrets or dependencies. Keep current main's approved Gemini/Supabase configuration. `APTITUDE_WEIGHT`, `DEMAND_WEIGHT` and `FEASIBILITY_WEIGHT` no longer override the required fixed weights; a future change requires documented rationale and a coordinated score-contract change. The additive schema can remain during an application rollback; do not restore NOT NULL while partial rows exist or mix scoring contracts when producing reports.

No hosted migration or production deployment was performed in this task. Hosted advisors/migration-history verification, real provider evaluation and independent counselor acceptance belong to the deployment/review environment. The CLI's local advisor/migration-list checks remain unavailable because its executable is terminated; this does not block packaging or embedded PostgreSQL verification.

## Verification

Final local commands from `/private/tmp/kumpas-sw-16`:

- `npm run test:access`: **538 passed**, 35 files, including scoring/model validation, actual packaged migration, RLS, run budgets/publication, legacy recovery, reports and intake regressions.
- `npm test`: **28 passed**. Total: **566 automated tests**.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: passed.
- `npm run lint:access` and `npm run lint:upload`: passed.
- Scoped `node node_modules/eslint/bin/eslint.js` over all changed Module 3/report/session/API/UI code, `tests/alignment*.test.ts`, recovery/RLS/provider tests and `scripts/provider-e2e.mjs`: passed, zero warnings.
- `git diff --check`: passed. `node --check scripts/provider-e2e.mjs`: passed.
- `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=sw16-public-test-key SUPABASE_SERVICE_ROLE_KEY=sw16-provider-check DOCUMENT_INTAKE_API_KEY=sw16-provider-check ACADEMIC_AUDITOR_API_KEY=sw16-provider-check INDUSTRY_ANALYST_API_KEY=sw16-provider-check FEASIBILITY_STRATEGIST_API_KEY=sw16-provider-check SYNTHESIS_API_KEY=sw16-provider-check npm run build`: passed outside the sandbox; all 19 static pages generated. These values are synthetic build configuration.
- `node scripts/provider-e2e.mjs`: its production webpack build and first ten checks passed, then analysis exposed incomplete metadata in the old synthetic source fixture. Updated the fixture to the actual retrieval contract and new scoring schema. `node scripts/provider-e2e.mjs --skip-build` then passed **13 HTTP checks**, with **zero live provider calls**. The runner verifies startup configuration rejection, actual route denials, extraction/upload, real specialist/synthesis/ranking wiring, three 71.00 ties with rank 1 in alphabetical order, approved version 1, run publication, error sanitization and browser-secret exclusion. CI runs the complete command including its own build.

The packaged-migration tests apply the actual SQL to the existing recommendation schema and cover legacy preservation, tied totals, nullable partials, out-of-range/nonfinite components and inconsistent totals. The RLS tests also apply this migration and retain owner isolation. New recovery tests confirm legacy ready/report-pending runs restart without losing approved inputs. This is embedded PostgreSQL verification, not a claim that a hosted migration ran.

Original failure evidence is retained in PR history: the pre-fix calculator misrounded totals, assigned separate tie ranks and calculated totals with missing components. Initial draft verification passed 337 tests and all CI checks at `48a936e`; the final counts above supersede it after integration with main. The prior synthetic report's three rendered pages were visually inspected; its score overlap and orphaned partial heading were corrected. The PDF renderer did not change during final main integration, and its current report tests pass.

The alignment workflow runs the focused tests, typecheck, scoped lint and synthetic production HTTP harness on PRs. Current CI links and results are recorded in the PR/tracker. No full live STD F08/F09/U01/R02 acceptance or independent defect closure is claimed from automated portions alone.

## Review and tracker

The [tracker](https://kumpas-team-tracker.jrvnryle.chatgpt.site/) is accessible using its `/api/state` endpoint. Retain Moen ownership and move SW-16 to In review with PR #57 and final verification. No migration blocker remains. Do not mark Done until human review, required passing checks and merge into main.

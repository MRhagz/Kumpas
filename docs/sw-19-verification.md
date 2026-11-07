# SW-19 — Two-audience report content

Implemented on branch `sw-19`, starting at `7e458d3`, on 7 November 2026. The tracker assigns Jerb and marks prerequisite SW-18 Done; SW-18 and SW-20 remain complete. Changes are uncommitted. The implementation plan was removed after execution as requested.

## Behavior

New reports begin with a student summary of supported options, evidence categories, comparative scores, score-based trade-offs, uncertainty and next steps. Counselor detail follows on a separate PDF page and in a native expandable section in the report view. Both use the same assembled student projection. The ordinary complete fixture has a one-page student summary; long content flows across pages without dropping text.

The summary formatter receives recommendations and evidence statuses, not raw note values. It uses SW-18's validated claims, withholds legacy explanation prose and identifies self-reported interests separately from measured academic evidence. No note panel is printed. Exact phrase echoes from financial, concern and impression context in option titles are withheld throughout the report; legitimate supported career names matching reviewed goals/interests remain visible. This guard supplements counselor review and does not establish semantic redaction of arbitrary paraphrases.

AI assistance, counselor responsibility and score limitations are explicit. Scores appear as points out of 100, with two decimal places; missing components retain no total or rank. Sources, dates, applied weights, approved input references and absent/unreadable/unsupported evidence remain available in counselor detail. Missing dates are never invented. Education-stage guidance is conditional because the approved profile has no reliable current Grade 10/SHS discriminator; historical grade rows do not establish current stage.

The report route passes the reserved report version and immutable run's approved profile version into assembly. Inconsistent recommendation versions are rejected. Ready reads preserve stored generation/expiry metadata and do not render/upload again. New PDF headers include a content/version marker; a cached PDF without the matching marker receives no newly assembled student summary in the UI. Existing PDF bytes remain unchanged. The UI explains regeneration for those artifacts.

Every generated PDF page identifies its origin as Draft, with approval recorded separately. SW-21 owns the exact-version approval/rejection and final-download workflow; approval must preserve the artifact bytes, version and expiry. This change does not implement that workflow. SW-25 owns full workflow integration and SW-30 owns release-wide checks. No model/prompt/scoring, schema, storage-policy, retention, dependency or configuration change was introduced.

## Documents and changed files

Requirements were checked against the approved [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view) Modules 4.1–4.2; [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view) Module 4; [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view) F10/F11, S01 and A02/A.7; [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view) FR-015/020/021/029 and NFR-014; and [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view) Finding 3. Submission documents were not edited. Installed Next.js Route Handler guidance and the repository Supabase skill, current changelog and private-download reference were also checked.

| Files | Change |
| --- | --- |
| `src/lib/report/types.ts`, `assembler.ts`, `reasoning-formatter.ts` | Shared student content, confidentiality boundary and explicit version identity. |
| `src/lib/report/pdf-renderer.ts` | Student-first layout; flowing detail paragraphs replace fixed-height cards; conservative Helvetica metrics and long-word wrapping prevent overflow. |
| `src/lib/module3/recommendation-provider.ts`, `src/app/api/reports/route.ts` | Approved evidence statuses, server-only confidential context, version propagation and cached-format detection. |
| `src/components/analysis/report-download-view.tsx` | Student summary, expandable counselor detail, version/status labels and responsive wrapping. |
| `tests/report-content.test.tsx`, `tests/processing-report.test.ts`, `tests/alignment-report.test.ts`, `.github/workflows/alignment-scoring.yml` | Required render/route integration coverage, score-label expectations and CI inclusion. |

## Verification

Linux, Node `v24.16.0`. Synthetic inputs only; zero live model calls. No new helper unit tests or full application/extraction/ingestion suites were added or run. Selected existing presentation tests preserve the earlier scoring contract while updating its labels.

| Exact command | Result |
| --- | --- |
| `SW19_PDF_QA_DIR=/tmp/kumpas-sw19-qa node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/report-content.test.tsx tests/processing-report.test.ts --maxWorkers=2` | PASS: 30 tests, comprising the initial 18 render/assembly cases and 12 report-route cases. |
| `SW19_PDF_QA_DIR=/tmp/kumpas-sw19-qa node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/report-content.test.tsx --maxWorkers=2` | PASS: final 19 render cases after strengthening the five distinct confidential-field markers and adding the source-unavailable comparison. |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/partial-specialists-ui.test.tsx tests/alignment-report.test.ts -t 'renders\|keeps partial\|does not call\|shows actual' --maxWorkers=2` | PASS: 5 selected presentation tests; 1 unrelated validator test skipped in this final run. |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/partial-specialists.test.ts -t 'returns recovery and keeps approved work\|handles academic-document combination' --maxWorkers=2` | PASS: 12 selected tests covering all eight document combinations and four insufficient/failed analysis variants; 16 unrelated cases skipped. |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | PASS. |
| `node node_modules/eslint/bin/eslint.js src/lib/report/types.ts src/lib/report/assembler.ts src/lib/report/reasoning-formatter.ts src/lib/report/pdf-renderer.ts src/lib/module3/recommendation-provider.ts src/app/api/reports/route.ts src/components/analysis/report-download-view.tsx tests/report-content.test.tsx tests/processing-report.test.ts tests/alignment-report.test.ts` | PASS, no warnings. |
| `git diff --check` | PASS. |

The 19 render cases include ten complete scenarios (five Grade 10 and five SHS contexts), partial/fewer-path/missing-date output, notes-only output, legacy explanation withholding, unavailable document statuses, long titles and multi-page references, insufficient evidence, a mismatched profile version, a legitimate goal-matching career name and an aptitude-only result without supporting reference sources. Actual PDF text is parsed with the installed PDF.js dependency. Every text item's page coordinates are checked against the margins; student section order, disclosures, identity, confidential/raw markers and complete long-content endings are asserted. These fixtures establish content behavior, not complete S01 or expert career-suitability acceptance. The final selected coverage totals 48 distinct checks across the render, route, presentation and missing-evidence cases.

Visual review generated `complete.pdf` (5 pages), `partial.pdf` (4), `notes-only.pdf` (5) and `long-content.pdf` (14) under `/tmp/kumpas-sw19-qa`. All 28 pages were rendered with `pdftoppm -r 85 -png` and inspected, including full-page views and contact sheets. No clipping or overlap remained. The initial render run caught underestimated font widths; standard Helvetica/Helvetica-Bold maximum widths corrected the issue.

Local Chromium checked all four synthetic report views at 1280- and 390-pixel widths: eight checks passed with no horizontal overflow. The native counselor disclosure retained focus and closed/reopened with Enter. The check used the actual rendered React fixture HTML and compiled project Tailwind styles. A long-URL grid overflow found during review was corrected with bounded grid tracks and wrapping. Chromium required an approved run outside the sandbox after socket initialization was denied. Screenshots and `browser-results.json` are in the same temporary QA directory. This covers the changed presentation and native control; authenticated Next.js workflow behavior remains part of the assigned workflow/release checks.

Vitest reports the existing future native-config-loader warning. No production build, hosted database operation, deployment, commit, push, PR or tracker-status update was performed.

## Human acceptance handoff

STD A02/A.7 comprehension remains Not Run. Under approved study arrangements, at least five intended students must each answer at least four of these five questions correctly about the same frozen report:

1. Which options are shown? Name the options actually listed in that report.
2. Why are they suggested? Identify one stated evidence-based reason.
3. What evidence is missing? Identify the report's missing-evidence notice; use the partial fixture for this question.
4. Does the score guarantee success? No: it compares supported options; the counselor helps guide the decision.
5. What happens next? Identify a stated next step and discuss it with the counselor.

Freeze the chosen partial report and its option/reason/missing-evidence answer key before the study. Record coded responses and actual per-student scores separately from counselor task results. Qualified-counselor evidence interpretation, full S01 workflows, stakeholder approval and release performance remain their assigned acceptance work. SW-19 is ready for code review with these limits; it is not marked Done by this verification record.

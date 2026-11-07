# SW-17 — Honest partial specialist results

## Baseline and scope

Fetched and rechecked `origin/main` at `53323e2b258f5385c4b71ccf3ec31032b05f6e1a` on 7 November 2026. Branch: `codex/sw-17`. The [team tracker](https://kumpas-team-tracker.jrvnryle.chatgpt.site/) already assigns SW-17 to Peeps in progress; that ownership is retained. SW-07, SW-14, SW-15 and SW-16 are Done, with no prerequisite waivers. Existing SW-28 commits and untracked `output/` artifacts were preserved.

Read the current approved [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view) Module 3.2 and Reliability (missing academic documents, Agent Failure Recovery, consistency and retry policy), [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view) §2.5 and Module 3 AgentDispatcher / MetaAgentSynthesizer / SynthesisInterpreter / RankedRecommendationBuilder, [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view) §3.9 F09 / §3.19 I06 / §3.29 S02, [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view) KMP-FR-014/020 and KMP-NFR-008, and [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view) Findings 2–3. Downloads from the linked Drive sources were read, rather than treating older repository copies as authoritative. Also read the installed Next 16.2.6 Route Handlers reference and the repository Supabase skill/current changelog/function guidance.

The audited synthesis substitution instruction was already removed by merged SW-16. Its validated 0–100 components, fixed 35/40/25 weights, null totals/ranks, evidence checks and deterministic ordering remain in use. This PR closes remaining integration gaps without changing that scoring contract.

## Behavior

- Invalid JSON, non-object specialist responses and missing/blank/non-string summaries become failed specialist outcomes. Existing operation-level transient retries remain bounded to one; malformed content and authentication errors receive no automatic retry.
- Empty public retrieval is explicitly `UNAVAILABLE`, distinct from execution `FAILED`. Successful outputs remain available for synthesis. Failed/unavailable analyses and sources are excluded from the synthesis payload; its existing evidence validator withholds their component scores.
- All-unavailable/all-failed results stop before synthesis with HTTP 422, an insufficient-evidence explanation and Retry/End Session. Unsupported synthesis also returns insufficient evidence; malformed synthesis returns the existing safe recovery error. Approved inputs remain saved.
- Specialist statuses and missing-source information travel with the existing version-bound recommendation JSON, survive resumed analysis, and reach report review. Partial comparisons include missing dimensions, specialist names and recovery guidance in the existing UI/PDF warning path. Complete rankings remain distinct from unscored partial comparisons.
- The analysis page marks only successful specialists complete. Failure and unavailable outcomes remain visible while the report is prepared. Unscored results are labelled partial even if every specialist responded. The existing database publication guard rejects obsolete-profile results without overwriting current work.

## Verification

Windows, Node `v22.16.0`, npm `10.9.2`. All provider/database fixtures are synthetic; PGlite executes actual approval/version/run/publication SQL. No paid provider calls or real student content were used.

| Exact command | Outcome |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.ts --maxWorkers=2` | PASS: 37 files, 569 tests. |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.mts` | PASS: 2 files, 28 tests. |
| `node node_modules/typescript/bin/tsc --noEmit --pretty false` | PASS, exit 0. |
| `node scripts/provider-e2e.mjs` | PASS outside the filesystem sandbox: production webpack build and 14 synthetic HTTP/configuration/payload checks; zero live provider calls. |
| `git diff --check` | PASS. |

Lint commands (both passed, exit 0):

```powershell
node node_modules/eslint/bin/eslint.js src/lib/module3/agent-dispatcher.ts src/lib/module3/meta-agent-synthesizer.ts src/lib/module3/synthesis-interpreter.ts src/lib/module3/ranked-recommendation-builder.ts src/lib/module3/provider-inputs.ts src/lib/module3/types.ts src/lib/module3/academic-auditor-agent.ts src/lib/module3/industry-analyst-agent.ts src/lib/module3/feasibility-strategist-agent.ts src/lib/report/types.ts src/app/api/reports/route.ts 'src/app/api/sessions/[sessionId]/analyze/route.ts' src/components/analysis/analysis-page.tsx src/components/analysis/loading-screen.tsx src/components/analysis/report-download-view.tsx tests/partial-specialists.test.ts tests/partial-specialists-ui.test.tsx tests/specialist-silos.test.ts
node node_modules/eslint/bin/eslint.js src/components/analysis/analysis-page.tsx src/components/analysis/loading-screen.tsx tests/partial-specialists.test.ts tests/partial-specialists-ui.test.tsx
```

`tests/partial-specialists.test.ts` has 28 integration cases: each single failure, all three two-failure combinations, transient recovery with simultaneous dispatch, malformed specialist content, unavailable retrieval, all-failed/all-unavailable/insufficient/malformed synthesis, all eight optional academic-document combinations with blank optional context, notes-only aptitude, persisted/resumed statuses, PDF warning content and delayed obsolete-profile publication. Three UI tests cover actual failure/unavailable states, partial review and successful responses with incomplete scoring. CI runs these with the existing alignment checks.

Earlier attempts and limits:

- `node node_modules/vitest/vitest.mjs run --config vitest.config.ts` initially passed 567/568 tests; the unrelated 9,999,999-byte upload route test exceeded its 15-second timeout under default parallelism. `node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/upload-routes.test.ts` passed all 19 cases, and the final reduced-worker full run passed all 569 tests (including the subsequently added UI case). No upload timeout or implementation was changed.
- The first sandboxed `node scripts/provider-e2e.mjs` compiled and type-checked, then failed on `EPERM` creating a Next prerender directory. Its approved unsandboxed rerun passed.
- Vitest emits the existing warning about ESM syntax in `vitest.config.ts` and future native config loading. The configuration was not changed for this task.
- Hosted Supabase, paid Gemini, production billing/privacy configuration, deployed browser/manual counselor workflows and the complete deployed STD acceptance procedures were not exercised. These automated cases do not establish full institutional acceptance. Human review, required remote checks and merge remain required before Done.

## Migration, configuration, deployment and handoff

No schema migration, dependency, environment variable, provider model, retry budget or weight change. Specialist metadata uses the existing `analysis_runs.recommendations` JSON and existing private report payload; no raw specialist response persistence is added. Redeploy the Next application normally after merge so backend and UI understand `UNAVAILABLE` and the optional status metadata. Existing stored recommendations remain readable; they are not backfilled with invented specialist statuses. No production deployment was performed during this task.

Preserve the counselor-operated Grade 10/SHS scope. No local pre-upload masking, deferred RTM features or submission document/PDF edits are included. Later document reconciliation must record the SW-05 paid-tier extraction exception and replace stale source-audit/test-evidence notes with reviewed SW-07/14/15/16/17 behavior and actual deployment evidence. Evidence-summary improvements remain SW-18; two-audience content/release gates and full workflow integration remain their assigned tasks. SW-17 moves to review, not Done.

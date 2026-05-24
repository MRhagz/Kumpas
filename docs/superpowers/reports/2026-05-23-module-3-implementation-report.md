# Module 3 — Federated Multi-Agent Analysis: Implementation Report

**Date:** 2026-05-23
**Branch:** `feat/module-3-multi-agent`
**Plan:** [`docs/superpowers/plans/2026-05-23-module3-audit-and-gaps.md`](../plans/2026-05-23-module3-audit-and-gaps.md)
**Status:** ✅ Code complete, build passing, all SDD components implemented

---

## 1. Executive Summary

Module 3 implements the **Federated Multi-Agent Career Analysis** pipeline of Kumpas. Upon receiving a counselor-approved student profile from Module 2, the system dispatches the profile to three independent specialist agents — Academic Auditor, Industry Analyst, and Feasibility Strategist — each querying its own isolated knowledge silo via pgvector similarity search. A meta-agent then synthesizes the three outputs into a unified, ranked list of career path recommendations with Chain-of-Thought reasoning summaries.

The pipeline uses the Gemini 2.0 Flash model for agent inference and Gemini text-embedding-004 for query embeddings (768-dim, matching the ingestion-time vectors). Each agent has its own API key for rate-limit isolation. Results are written to `ranked_recommendations` and `recommendation_sources` tables with RLS policies, and are consumable by Module 4's report assembler via a real `RecommendationProvider`.

All 14 SDD components are implemented. Two Supabase migrations were applied. The full Next.js build succeeds.

---

## 2. Implementation Status

| # | Component | File(s) | Status |
|---|---|---|---|
| 1 | Module 3 types | `src/lib/module3/types.ts` | ✅ |
| 2 | QueryEmbeddingService | `src/lib/module3/query-embedding-service.ts` | ✅ |
| 3 | VectorStoreQueryService | `src/lib/module3/vector-store-query-service.ts` | ✅ |
| 4 | AcademicAuditorAgent | `src/lib/module3/academic-auditor-agent.ts` | ✅ |
| 5 | IndustryAnalystAgent | `src/lib/module3/industry-analyst-agent.ts` | ✅ |
| 6 | FeasibilityStrategistAgent | `src/lib/module3/feasibility-strategist-agent.ts` | ✅ |
| 7 | AgentDispatcher | `src/lib/module3/agent-dispatcher.ts` | ✅ |
| 8 | SynthesisInterpreter | `src/lib/module3/synthesis-interpreter.ts` | ✅ |
| 9 | AlignmentScoreCalculator | `src/lib/module3/alignment-score-calculator.ts` | ✅ |
| 10 | RankingAgent | `src/lib/module3/ranking-agent.ts` | ✅ |
| 11 | RankedRecommendationBuilder | `src/lib/module3/ranked-recommendation-builder.ts` | ✅ |
| 12 | MetaAgentSynthesizer | `src/lib/module3/meta-agent-synthesizer.ts` | ✅ |
| 13 | AnalysisProgressOverlay | `src/components/analysis/loading-screen.tsx` (updated) | ✅ |
| 14 | API Route | `src/app/api/sessions/[sessionId]/analyze/route.ts` | ✅ |

### Supporting artifacts

| Artifact | Status |
|---|---|
| DB: `ranked_recommendations` table + RLS policy | ✅ Applied |
| DB: `recommendation_sources` table + RLS policy | ✅ Applied |
| DB: `match_knowledge_chunks` pgvector function | ✅ Applied |
| Module 4 bridge: `recommendation-provider.ts` | ✅ Wired as default |
| npm: `@google/generative-ai` | ✅ Installed |

---

## 3. Architecture Overview

### Request flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend (analysis/page.tsx)                                       │
│  ─ Marks progress stages as LoadingScreen renders                   │
│  ─ POST /api/sessions/{id}/analyze                                  │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────────┐
│  API Route (analyze/route.ts)                                       │
│  ─ Reads approved_profile from sessions table                       │
│  ─ Calls AgentDispatcher.dispatch()                                 │
│  ─ Calls MetaAgentSynthesizer.synthesize()                          │
│  ─ Returns RankedRecommendationList JSON                            │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────────┐
│  AgentDispatcher (Promise.all — parallel)                           │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐   │
│  │ AcademicAuditor  │ │ IndustryAnalyst │ │ FeasibilityStrat.   │   │
│  │ → market_        │ │ → live_labor_   │ │ → path_             │   │
│  │   analytics silo │ │   demand silo   │ │   feasibility silo  │   │
│  └────────┬─────────┘ └────────┬────────┘ └──────────┬──────────┘   │
│           │ embed + search     │                     │              │
│           │ + Gemini inference │                     │              │
│           ▼                    ▼                     ▼              │
│         AgentOutput[]  (3 independent results)                      │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────────┐
│  MetaAgentSynthesizer (sequential)                                  │
│  1. SynthesisInterpreter  → IntermediateSynthesis (Gemini JSON)     │
│  2. AlignmentScoreCalculator → ScoredCareerPath[] (deterministic)   │
│  3. RankingAgent → RankedCareerPath[] (Gemini JSON — CoT)           │
│  4. RankedRecommendationBuilder → writes to DB, returns list        │
└─────────────────────────────────────────────────────────────────────┘
```

### Silo enforcement

| Agent | Allowed Silo | Enforced By |
|---|---|---|
| AcademicAuditor | `market_analytics` | `AGENT_SILO_MAP` in VectorStoreQueryService |
| IndustryAnalyst | `live_labor_demand` | `AGENT_SILO_MAP` in VectorStoreQueryService |
| FeasibilityStrategist | `path_feasibility` | `AGENT_SILO_MAP` in VectorStoreQueryService |

Any query targeting a silo not assigned to the requesting agent is rejected before reaching Supabase.

### Alignment score formula

```
alignmentScore = (0.35 × aptitudeScore) + (0.40 × demandScore) + (0.25 × feasibilityScore)
```

Weights are environment-configurable via `APTITUDE_WEIGHT`, `DEMAND_WEIGHT`, `FEASIBILITY_WEIGHT`.

---

## 4. Environment Variables

| Variable | Purpose |
|---|---|
| `ACADEMIC_AUDITOR_API_KEY` | Gemini API key for AcademicAuditorAgent (embedding + inference) |
| `INDUSTRY_ANALYST_API_KEY` | Gemini API key for IndustryAnalystAgent (embedding + inference) |
| `FEASIBILITY_STRATEGIST_API_KEY` | Gemini API key for FeasibilityStrategistAgent (embedding + inference) |
| `SYNTHESIS_API_KEY` | Gemini API key for SynthesisInterpreter + RankingAgent |
| `APTITUDE_WEIGHT` | Optional. Default `0.35` |
| `DEMAND_WEIGHT` | Optional. Default `0.40` |
| `FEASIBILITY_WEIGHT` | Optional. Default `0.25` |

---

## 5. Database Changes

### New tables

**`ranked_recommendations`**
- `id` (uuid PK), `session_id` (FK → sessions), `rank`, `career_path`, `alignment_score`, `aptitude_fit`, `market_demand`, `financial_feasibility`, `reasoning_summary`, `key_signals` (jsonb), `status` (complete/degraded/incomplete), `degraded_reason`, `incomplete_reason`, `created_at`
- RLS: counselors can SELECT rows linked to their own sessions

**`recommendation_sources`**
- `id` (uuid PK), `recommendation_id` (FK → ranked_recommendations, CASCADE), `title`, `reference`, `acquisition_method`, `ingestion_timestamp`, `related_signals` (jsonb), `created_at`
- RLS: counselors can SELECT rows linked to their own recommendations

### New function

**`match_knowledge_chunks(query_embedding, target_silo_id, match_count, match_threshold)`**
- pgvector cosine similarity search filtered by silo
- Returns: content, source metadata, similarity score

---

## 6. Failure Recovery

| Scenario | Behavior | SRS Ref |
|---|---|---|
| Single agent fails | 1 automatic retry. If retry fails, `AgentOutput.status = FAILED`. Pipeline continues with remaining agents. | Agent Failure Recovery |
| All agents fail | API returns 502, counselor notified. | Agent Failure Recovery |
| SynthesisInterpreter fails | 1 automatic retry. If retry fails, pipeline aborts, counselor notified. | Meta-agent abort |
| RankingAgent fails | Pipeline continues with empty reasoning summaries. Recommendations flagged `degraded`. | Graceful degradation |
| < 3 recommendations produced | `RankedRecommendationBuilder` throws. API returns 500. | SRS 3.2 minimum |

---

## 7. Deviations from SDD

| Deviation | Reason | Impact |
|---|---|---|
| QueryEmbeddingService accepts API key per-call instead of hardcoded singleton | Supports per-agent API key isolation (user requirement) | None — same class instance, same model, same vector space |

---

## 8. Commits

| SHA | Message |
|---|---|
| `66a9b76` | `feat(module3): implement federated multi-agent analysis pipeline` |
| `73dee8b` | `rename adjacentCareer stage to synthesis per SDD 3.2` |
| `80970f8` | `wire module3 recommendation provider into report assembler` |

---

## 9. What's Next

Module 3 output is now written to the database and readable via `module3RecommendationProvider`, which is wired as the default provider in `src/lib/report/assembler.ts`. Module 4 (Explainable Report Generation) can consume this data to render the PDF report.

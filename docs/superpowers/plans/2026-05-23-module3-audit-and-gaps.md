# Module 3 Audit & Gap Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the existing Module 3 implementation against SDD/SRS, fix identified gaps, and commit each fix independently.

**Architecture:** Module 3 is a Federated RAG multi-agent pipeline. Three specialist agents query isolated knowledge silos via pgvector, then a meta-agent synthesizes their outputs into ranked career recommendations. All code lives in `src/lib/module3/` with one API route at `src/app/api/sessions/[sessionId]/analyze/route.ts`.

**Tech Stack:** Next.js 16, TypeScript, Supabase (pgvector, RLS), Google Generative AI SDK (`@google/generative-ai`), Gemini 2.0 Flash + text-embedding-004

---

## Audit: SDD Component Coverage

| SDD Component | File | Status | Notes |
|---|---|---|---|
| AgentDispatcher | `agent-dispatcher.ts` | ✅ Complete | Parallel dispatch, 1-retry failure recovery |
| AcademicAuditorAgent | `academic-auditor-agent.ts` | ✅ Complete | RAG against `market_analytics` silo |
| IndustryAnalystAgent | `industry-analyst-agent.ts` | ✅ Complete | RAG against `live_labor_demand` silo |
| FeasibilityStrategistAgent | `feasibility-strategist-agent.ts` | ✅ Complete | RAG against `path_feasibility` silo |
| QueryEmbeddingService | `query-embedding-service.ts` | ✅ Complete | text-embedding-004, 768-dim, API key parameterized (documented deviation from singleton) |
| VectorStoreQueryService | `vector-store-query-service.ts` | ✅ Complete | Strict silo routing via `AGENT_SILO_MAP`, rejects cross-silo queries |
| MetaAgentSynthesizer | `meta-agent-synthesizer.ts` | ✅ Complete | Sequential: SynthesisInterpreter → Calculator → RankingAgent → Builder |
| SynthesisInterpreter | `synthesis-interpreter.ts` | ✅ Complete | Gemini JSON mode, score clamping 0-1 |
| AlignmentScoreCalculator | `alignment-score-calculator.ts` | ✅ Complete | Weighted formula, env-configurable weights |
| RankingAgent | `ranking-agent.ts` | ✅ Complete | CoT reasoning, does not alter scores/ranking |
| RankedRecommendationBuilder | `ranked-recommendation-builder.ts` | ✅ Complete | Writes to DB, enforces ≥3 recs, flags incomplete/degraded |
| AnalysisProgressOverlay | `loading-screen.tsx` | ⚠️ Gap | Last stage labeled "Adjacent Career Generation" instead of "Synthesizing Career Recommendations" |
| DB: ranked_recommendations | Supabase migration | ⚠️ Gap | Table exists, RLS enabled, but no RLS policies defined |
| DB: recommendation_sources | Supabase migration | ⚠️ Gap | Table exists, RLS enabled, but no RLS policies defined |
| Module 4 bridge | `recommendation-provider.ts` | ⚠️ Gap | Provider created but not wired into `report/assembler.ts` (Module 4 territory) |

## Audit: SRS Requirements Coverage

| SRS Requirement | Status | Notes |
|---|---|---|
| 3.1: Three independent reasoning agents | ✅ | Parallel dispatch via Promise.all |
| 3.1: Each queries its decoupled knowledge silo | ✅ | VectorStoreQueryService enforces routing |
| 3.1: Three distinct independent outputs produced | ✅ | AgentOutput[] collected by AgentDispatcher |
| 3.2: Meta-agent synthesis step | ✅ | MetaAgentSynthesizer orchestrates |
| 3.2: Aptitude-Demand Alignment Score | ✅ | AlignmentScoreCalculator with configurable weights |
| 3.2: ≥3 distinct ranked career recommendations | ✅ | RankedRecommendationBuilder enforces minimum |
| 3.2: Queued for Module 4 | ✅ | Written to DB, module3RecommendationProvider reads |
| NFR: Agent Failure Recovery | ✅ | 1 retry per agent, partial recs on failure |
| NFR: Data Consistency | ✅ | ApprovedProfile is read-only throughout |
| NFR: Approved profile propagates unchanged | ✅ | No module modifies the approved profile |

## Audit: Documented Deviations from SDD

1. **QueryEmbeddingService API key parameterization**: SDD says "shared singleton." Implementation is a singleton instance but accepts API key per-call to support per-agent key isolation. This was agreed with the user before implementation.

## Gaps to Fix

### Gap 1: Loading screen synthesis label
The last sequential stage after the parallel agents is labeled "Adjacent Career Generation" / `adjacentCareer`. SDD §3.2 says this should be "Synthesizing Career Recommendations" as a 4th sub-process.

### Gap 2: RLS policies for new tables
`ranked_recommendations` and `recommendation_sources` have `ENABLE ROW LEVEL SECURITY` but no policies defined. SDD §2.6 requires session-scoped RLS: "database operations are restricted so that users can only interact with records where the counselor_id matches their authenticated user token."

### Gap 3: Module 4 bridge not wired
`module3RecommendationProvider` exists in `src/lib/module3/recommendation-provider.ts` but the report assembler (`src/lib/report/assembler.ts`) still defaults to `mockRecommendationProvider`. This is Module 4 code, so it's outside the "do not modify Module 2 code" constraint, but it IS the bridge that makes Module 3 output consumable.

---

### Task 1: Fix loading screen synthesis label

**Files:**
- Modify: `src/lib/analysis-types.ts:113-121` (StageName type and usage)
- Modify: `src/components/analysis/loading-screen.tsx:37-41` (stage label)
- Modify: `src/components/analysis/processing-view.tsx:30-35` (stage metadata)
- Modify: `src/app/analysis/page.tsx:54-64` (stage names in runPipeline)

- [ ] **Step 1: Update StageName and stage metadata**

In `src/lib/analysis-types.ts`, rename `adjacentCareer` to `synthesis` in the `StageName` type:

```typescript
export type StageName =
    | "documentParsing"
    | "notesParsing"
    | "transcriptionLayer"
    | "feasibility"
    | "laborMarket"
    | "jobDemand"
    | "synthesis";
```

In `src/components/analysis/processing-view.tsx`, update the `STAGE_META` entry and `STAGE_ORDER`:

```typescript
synthesis: {
    label: "Synthesizing Career Recommendations",
    description: "Combining specialist analyses into final recommendations...",
},
```

```typescript
const STAGE_ORDER: StageName[] = [
    "documentParsing",
    "notesParsing",
    "transcriptionLayer",
    "feasibility",
    "laborMarket",
    "jobDemand",
    "synthesis",
];
```

- [ ] **Step 2: Update LoadingScreen stage config and checks**

In `src/components/analysis/loading-screen.tsx`, rename the last `STAGE_CONFIG` entry from `adjacentCareer` to `synthesis` and update its label:

```typescript
{
    key: "synthesis",
    label: "Synthesizing Career Recommendations",
    sub: "Combining all specialist analyses into ranked career paths",
    icon: Sparkles,
    color: "#8B5E3C",
},
```

Update `HEADERS` key from `adjacentCareer` to `synthesis`:
```typescript
synthesis: { title: "Generating Career Insights", subtitle: "Synthesizing all agents into final recommendations..." },
```

Update all `adjacentCareer` references in progress state, `getCurrentPhase`, and boolean checks to `synthesis`.

- [ ] **Step 3: Update analysis page stage names**

In `src/app/analysis/page.tsx`, replace `"adjacentCareer"` with `"synthesis"` in the `markStages` calls:

```typescript
markStages([
    "documentParsing", "notesParsing", "transcriptionLayer",
    "feasibility", "laborMarket", "jobDemand", "synthesis",
]);
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit && npx next build`
Expected: Clean compile, no errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis-types.ts src/components/analysis/loading-screen.tsx src/components/analysis/processing-view.tsx src/app/analysis/page.tsx
git commit -m "rename adjacentCareer stage to synthesis per SDD 3.2"
```

---

### Task 2: Add RLS policies for Module 3 tables

**Files:**
- Supabase migration (applied via MCP tool)

- [ ] **Step 1: Apply RLS policies migration**

Apply a Supabase migration adding read policies for counselors (through session join) and full access for service role:

```sql
-- Counselors can read their own session's recommendations
CREATE POLICY "Counselors can read own recommendations"
  ON public.ranked_recommendations
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.sessions WHERE counselor_id = auth.uid()
    )
  );

-- Counselors can read sources for their own recommendations
CREATE POLICY "Counselors can read own recommendation sources"
  ON public.recommendation_sources
  FOR SELECT
  USING (
    recommendation_id IN (
      SELECT rr.id FROM public.ranked_recommendations rr
      JOIN public.sessions s ON rr.session_id = s.id
      WHERE s.counselor_id = auth.uid()
    )
  );
```

Service-role key bypasses RLS by default, so no separate policy is needed for server-side writes.

- [ ] **Step 2: Verify policies exist**

Run SQL: `SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('ranked_recommendations', 'recommendation_sources');`
Expected: Two rows, one per table.

- [ ] **Step 3: Commit** (no local files changed — migration is remote-only, but note in commit)

No local file to commit for this task. The migration is applied directly to Supabase. If the project tracks migrations locally, add a migration file.

---

### Task 3: Wire module3RecommendationProvider into report assembler

**Files:**
- Modify: `src/lib/report/assembler.ts:1-2` (import change)
- Modify: `src/lib/report/assembler.ts:31` (default provider)

- [ ] **Step 1: Change default provider**

In `src/lib/report/assembler.ts`, change the import and default:

```typescript
import { module3RecommendationProvider } from "@/lib/module3/recommendation-provider";
```

Change line 31 from:
```typescript
const provider = options.provider ?? mockRecommendationProvider;
```
to:
```typescript
const provider = options.provider ?? module3RecommendationProvider;
```

Remove the unused `mockRecommendationProvider` import if no other code references it.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean compile

- [ ] **Step 3: Commit**

```bash
git add src/lib/report/assembler.ts
git commit -m "wire module3 recommendation provider into report assembler"
```

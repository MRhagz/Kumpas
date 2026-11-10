# Module 3 implementation report

Kumpas dispatches three specialists against fixed public evidence silos: Academic Auditor uses PSA Market Analytics, Industry Analyst uses DOLE Live Labor Demand, and Feasibility Strategist uses CHED/TESDA Path Feasibility. Query and stored embeddings use `gemini-embedding-001` with 768 dimensions. Foreign-silo and incompatible-vector results are rejected before generation.

The system consumes the immutable approved profile and shares one persisted 300-second deadline through retrieval, specialist generation, synthesis, ranking and PDF publication. Each specialist has bounded attempts and one permitted transient retry. The system supplies successful validated analyses to synthesis and supports explicitly partial comparisons when evidence is unavailable.

The system calculates fixed 35/40/25 aptitude/demand/feasibility totals, rounds before sorting and shares ranks for equal totals. Missing components retain null totals and ranks. Explanations use validated input/source citations and cannot alter scores. Versioned publication prevents obsolete results from replacing current work.

The system passes retrieval/silo, provider, timeout, partial-output, score, evidence, persistence and report-integration checks. Human explanation review and defect retests pass.

The system contracts are specified in [silos](../../sw-14-verification.md), [processing budget](../../sw-15-processing-budget.md), [scores](../../sw-16-verification.md), [partial results](../../sw-17-verification.md) and [cited summaries](../../sw-18-verification.md). Current results are in [release verification](../../sw-31-verification.md).

# SW-16 deterministic alignment scores

The system accepts finite component values from 0 to 100 or null, supported by approved input fields and authorized retrieved references. Invalid, coerced or out-of-range components are rejected.

The system calculates 35% aptitude + 40% demand + 25% feasibility, rounds the total to two decimals before sorting, assigns shared competition ranks and orders ties alphabetically. Explanations cannot change scores, weights or ranks.

The system leaves total and rank null when a component is missing. It never substitutes zero or redistributes weights. Unsupported-only results return insufficient evidence without publishing a report. Legacy results retain their original scoring contract and require regeneration for a new-contract report.

The system passes calculation, null/tie/rounding, persistence, UI and PDF regressions, including exact totals 84.50, 79.45 and 71.55. Human score interpretation and defect retests pass.

## Database contract

The system uses `20261106161754_sw16_alignment_scoring.sql`. Hosted migration readback confirms the applicable contracts are installed.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

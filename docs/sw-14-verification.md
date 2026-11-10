# SW-14 specialist evidence silos

The system enforces a fixed specialist-to-silo mapping.

| Specialist | Silo | Sources |
| --- | --- | --- |
| Academic Auditor | Market Analytics | PSA |
| Industry Analyst | Live Labor Demand | DOLE BLE |
| Feasibility Strategist | Path Feasibility | CHED and TESDA |

The service-only retrieval RPC rejects missing/unknown specialist identities, foreign silos, invalid limits and incompatible vectors. TypeScript validates every returned source before generation. Empty retrieval returns unavailable evidence without falling back to another silo.

The system embeds selected academic/career search signals rather than raw notes or session references. Specialists consume the immutable approved profile and cannot write public knowledge. Actual source identity, chunk, acquisition method and available dates reach synthesis and reporting.

The system passes routing, query-minimization, returned-source validation and SQL isolation checks. Human evidence interpretation verification passes.

## Database contract

The system uses `20261105070028_sw14_specialist_evidence_silos.sql`. Hosted migration readback confirms the applicable contracts are installed.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

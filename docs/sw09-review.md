# SW-09 embedding and ingestion contracts

The system uses `gemini-embedding-001` with 768 dimensions: `RETRIEVAL_DOCUMENT` for ingestion and `RETRIEVAL_QUERY` for search. Configuration, vectors and stored fingerprints must match this contract.

The system diffs stable chunk identities before embedding, reuses unchanged vectors and commits validated chunks, ingestion logs, freshness and publication cache in one transaction. Complete validation, snapshot checks and atomic commit preserve the previous valid source throughout recovery.

The system rejects incompatible stored vectors before specialist generation. The hosted knowledge-base readback on 10 November 2026 finds zero incompatible vectors in all three silos.

The system passes six TypeScript embedding/query checks, ingestion refresh regressions and the vector SQL contracts. Human provenance and retrieval interpretation verification pass.

## Database contract

The system uses `20261104000000_sw09_embedding_contract.sql`. Hosted migration readback confirms the applicable contracts are installed.

## Verification

The system verification results and executable checks are recorded in [release verification](sw-31-verification.md).

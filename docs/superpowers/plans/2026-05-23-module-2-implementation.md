# Module 2 implementation

Kumpas provides counselor-owned Grade 10 and SHS intake with optional Form 137, NCAE and NAT documents and typed or reviewed photographed notes. The system requires Career Goal and Personal Interests and Strengths and preserves blank optional context.

The system validates decoded JPEG/PNG/WEBP/PDF content and the inclusive 10,000,000-byte boundary. Private resumable uploads bind to the owned session and current revision. Extraction uses the configured paid Gemini service, retains nullable validated fields and provenance, and discards unexpected response content. Temporary objects are deleted through durable cleanup tracking.

The system saves editable extraction/notes drafts, separates original and corrected values and approves the exact reviewed revisions into an immutable profile version. Edits invalidate dependent runs and reports. Ownership, active Auth state, expiry and expected tokens are checked on every server transition.

The system passes notes, upload, extraction, approval, concurrency, recovery, correction-log, RLS and cleanup checks. Human intake, source review and defect retests pass.

The system contracts are specified in [academic uploads](../../sw-03-academic-uploads.md), [notes](../../sw-04-verification.md), [extraction](../../sw-06-verification.md), [reviewed inputs](../../sw-07-verification.md) and [correction logs](../../sw-08-verification.md). Current results are in [release verification](../../sw-31-verification.md).

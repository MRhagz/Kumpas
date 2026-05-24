# Module 2 — Document Intake & Extraction: Implementation Report

**Date:** 2026-05-23
**Branch:** `feat/module-2-implementation`
**Plan:** [`docs/superpowers/plans/2026-05-23-module-2-implementation.md`](../plans/2026-05-23-module-2-implementation.md)
**Status:** ✅ Code complete; manual browser test + commits pending

---

## 1. Executive Summary

Module 2 implements the **Document Intake & Extraction** layer of Kumpas — the surface where a guidance counselor uploads a student's NCAE, Form 137, or NAT documents, has PII automatically redacted, sees structured academic data extracted, edits any fields the AI got wrong, fills in five required qualitative-notes fields, and approves the bundle to start the multi-agent analysis.

The end-to-end pipeline now lives behind three Next.js App Router endpoints and is anchored in Supabase (Postgres + Storage). Two-pass Gemini Vision performs PII bounding-box detection followed by structured extraction; `sharp` composites black rectangles over the detected regions before either storage or extraction.

All twelve Module 2 SDD components are implemented. All four database tables and the `kumpas-documents` storage bucket exist. The full Next.js build (TypeScript + static page generation) succeeds.

---

## 2. Implementation Status

| # | Task | Files | Status |
|---|---|---|---|
| 1 | Env vars + Supabase client | `.env`, `src/lib/supabase.ts` | ✅ |
| 2 | Database migration | `supabase/migrations/20260523000000_module2_sessions.sql` | ✅ Applied |
| 3 | Module 2 TypeScript types | `src/types.ts` | ✅ |
| 4 | `SessionInitializationService` + `POST /api/sessions` | `src/lib/module2/session-initialization-service.ts`, `src/app/api/sessions/route.ts` | ✅ |
| 5 | `PIIRedactionService` (Gemini Vision two-pass) | `src/lib/module2/pii-redaction-service.ts` | ✅ |
| 6 | `DocumentStorageService` | `src/lib/module2/document-storage-service.ts` | ✅ |
| 7 | `GeminiExtractionService` | `src/lib/module2/gemini-extraction-service.ts` | ✅ |
| 8 | `FileUploadController` | `src/app/api/sessions/[sessionId]/upload/route.ts` | ✅ |
| 9 | `StudentProfileBuilder` + approve route | `src/lib/module2/student-profile-builder.ts`, `src/app/api/sessions/[sessionId]/approve/route.ts` | ✅ |
| 10 | `UploadStatusIndicator` component | `src/components/input/upload-status-indicator.tsx` | ✅ |
| 11 | `DocumentUploadPanel` component | `src/components/input/document-upload-panel.tsx` | ✅ |
| 12 | `SessionNotesForm` + `EditableFieldForm` | `src/components/input/session-notes-form.tsx`, `editable-field-form.tsx` | ✅ |
| 13 | `ExtractionResultsPanel` | `src/components/input/extraction-results-panel.tsx` | ✅ |
| 14 | `ConfirmationApprovalBar` | `src/components/input/confirmation-approval-bar.tsx` | ✅ |
| 15 | Wire `input-container.tsx` to session-based backend | `src/components/input/input-container.tsx` | ✅ |

---

## 3. Architecture Overview

### Three-layer request flow

```
┌────────────────────────────────────────────────────────────────────┐
│  Frontend (React, "use client")                                    │
│  ─ input-container.tsx (page state, session lifecycle)             │
│  ─ DocumentUploadPanel ──┐                                         │
│  ─ ExtractionResultsPanel│                                         │
│  ─ SessionNotesForm      │                                         │
│  ─ ConfirmationApprovalBar                                         │
└────────────────────────┬────┬──────────────────────────────────────┘
                         │    │
                         │    │  (fetch)
                         ▼    ▼
┌────────────────────────────────────────────────────────────────────┐
│  Next.js App Router API routes                                     │
│  ─ POST /api/sessions                              → session-init  │
│  ─ POST /api/sessions/[id]/upload                  → upload pipe   │
│  ─ POST /api/sessions/[id]/approve                 → builder       │
└────────────────────────┬───────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────────┐
│  Service layer (src/lib/module2/*)                                 │
│  ─ SessionInitializationService                                    │
│  ─ PIIRedactionService     (Gemini Vision + sharp)                 │
│  ─ DocumentStorageService  (Supabase Storage)                      │
│  ─ GeminiExtractionService (Gemini text extraction)                │
│  ─ StudentProfileBuilder                                           │
└────────────────────────┬───────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐    ┌──────────────────────┐
              │ Supabase Postgres    │    │ Supabase Storage     │
              │ ─ sessions           │    │ ─ kumpas-documents/  │
              │ ─ session_notes      │    │   <sessionId>/       │
              │ ─ extraction_results │    │     <docId>.jpg      │
              │ ─ correction_logs    │    └──────────────────────┘
              └──────────────────────┘
```

### Upload-pipeline detail (single request)

```
File (multipart) ──► /api/sessions/[id]/upload
        │
        ▼
   rawBuffer (Buffer in memory — never touches disk)
        │
        ▼
   PIIRedactionService.redact(rawBuffer, mimeType)
        ├─ Gemini Vision pass-1: returns [{ type, text, box_2d }]
        ├─ sharp metadata for image dims
        └─ sharp.composite(<svg rects>) ──► redactedBuffer
        │
        ▼
   DocumentStorageService.storeRedacted(redactedBuffer, sessionId, docId)
        └─ Supabase Storage path: <sessionId>/<docId>.jpg
        │
        ▼
   GeminiExtractionService.extract(redactedBuffer, docType, sessionId, redactedPath)
        ├─ Gemini Vision pass-2 (structured) using docType prompt
        └─ INSERT extraction_results
        │
        ▼
   DocumentStorageService.retrieveRedacted(redactedPath)
        └─ Returns 30-min signed URL
        │
        ▼
   Response: { documentId, extractionResultId, docType,
               structuredData, redactedImageUrl, piiCount, status }
```

---

## 4. Stated Deviations from SDD / SRS

Six deviations are intentional and were carried through implementation. Each must appear in the PR description.

| # | Source clause | Deviation as implemented | Reason |
|---|---|---|---|
| 1 | SDD §2 says `PIIRedactionService` consumes from a message queue | **Synchronous** inside the upload request handler | Vercel has no persistent process / queue primitive |
| 2 | SDD §2 says `FileUploadController` returns 202 + SSE indicator | Returns when **complete**; indicator shows loading state during request | Follows from #1 |
| 3 | SDD says `DocumentStorageService` stores raw images in `/tmp` then deletes | Raw image held only as **in-memory `Buffer`**; never written to disk | Safer and unnecessary because redaction completes in the same request |
| 4 | SDD says RLS enforces `counselor_id = auth.uid()` | `counselor_id` is **nullable**; service-role key is used; RLS policies exist but auth enforcement is deferred to Module 5 | Module 5 implements auth |
| 5 | SDD describes `ExtractionResultsPanel` as "read-only" | Panel **allows field-level editing**; diffs against original are emitted to `correction_logs` | SRS 2.2 step 5 explicitly requires counselor to edit and correct; SRS takes precedence |
| 6 | **SRS 3.1.2** — "Under no circumstances shall unredacted document content be submitted to the Gemini API" | **Raw image is sent to Gemini Vision in pass 1** for PII bounding-box detection. Only the redacted image is then stored and used for pass-2 structured extraction. | Team vendor evaluation showed Gemini Vision PII detection materially outperforms Tesseract.js on Philippine documents. Mitigated by Google Gemini paid-tier no-retention guarantee. **Must be called out in the Module 2 PR description.** |

---

## 5. File Inventory

### Created

| Path | Purpose |
|---|---|
| `src/lib/supabase.ts` | Two clients: `supabaseAnon` (RLS-respecting, browser-safe) and `supabaseAdmin` (service-role, server-only — never import in `"use client"`). |
| `src/lib/module2/session-initialization-service.ts` | `createSession`, `createSessionNotes`, `updateLastActivity`. |
| `src/lib/module2/pii-redaction-service.ts` | Two-pass Gemini Vision PII detection + `sharp` composite redaction. Returns `{ redactedBuffer, piiCount, piiRegions }`. |
| `src/lib/module2/document-storage-service.ts` | `storeRedacted` / `retrieveRedacted` (30-min signed URL) / `deleteRedacted` against the `kumpas-documents` bucket. |
| `src/lib/module2/gemini-extraction-service.ts` | Three doc-type-specific prompts (NCAE / Form 137 / NAT), Gemini call, `extraction_results` INSERT. |
| `src/lib/module2/student-profile-builder.ts` | Aggregates extraction_results, builds `ApprovedProfile`, updates `sessions.approved_profile`, updates `session_notes`, batch-inserts `correction_logs`. |
| `src/app/api/sessions/route.ts` | `POST` — create session + empty session_notes row. |
| `src/app/api/sessions/[sessionId]/upload/route.ts` | `POST` (multipart) — orchestrates redact → store → extract → signed URL. |
| `src/app/api/sessions/[sessionId]/approve/route.ts` | `POST` (JSON) — validates all 5 notes fields, calls `StudentProfileBuilder`. |
| `src/components/input/document-upload-panel.tsx` | UI for the three optional document slots; triggers upload when both file and `docType` are set. |
| `src/components/input/upload-status-indicator.tsx` | Per-slot status banner: spinner, progress bar, PII-redacted badge, error message. |
| `src/components/input/session-notes-form.tsx` | The five WYSIWYG fields. Exported `SESSION_NOTE_FIELDS` for any future re-use. |
| `src/components/input/editable-field-form.tsx` | Thin chrome around `SessionNotesForm` for the Manual tab. |
| `src/components/input/extraction-results-panel.tsx` | Tabbed (1 doc = no tabs) review/edit UI with `NCAEEditor`, `NATEditor`, `Form137Editor`. Toggles the redacted image preview. |
| `src/components/input/confirmation-approval-bar.tsx` | "Begin Multi Agent Analysis" CTA. Strips HTML to check the five notes fields are non-empty. |
| `supabase/migrations/20260523000000_module2_sessions.sql` | Tables, indexes, RLS policies, storage bucket. |
| `docs/superpowers/plans/2026-05-23-module-2-implementation.md` | The plan that drove this work. |

### Modified

| Path | Change |
|---|---|
| `src/types.ts` | Added `Session`, `SessionNotes`, `ExtractionResult`, `CorrectionLog`, `ApprovedProfile`, `UploadedDocument`. |
| `src/components/input/input-container.tsx` | Rewritten to: (a) create a session via `POST /api/sessions` on mount; (b) wire `DocumentUploadPanel` / `ExtractionResultsPanel` / `EditableFieldForm` / `ConfirmationApprovalBar`; (c) compute correction diffs against `originalExtractedData` and submit them with approval; (d) gate the CTA on all five notes fields being non-empty (per SDD, not "any one field"); (e) route to `/analysis?session=<id>` on success. |
| `.env` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DOCUMENT_INTAKE_API_KEY`. |

---

## 6. Database Schema

All tables live in the `public` schema. RLS is enabled on every table; policies use `auth.uid()` and will activate once Module 5 ships authentication.

### `sessions`
```sql
id              uuid PK default gen_random_uuid()
counselor_id    uuid NULL                              -- nullable until Module 5
status          text NOT NULL                          -- 'active' | 'completed' | 'expired' | 'cancelled'
approved_profile jsonb NULL                            -- written by StudentProfileBuilder
created_at      timestamptz NOT NULL default now()
last_activity   timestamptz NOT NULL default now()
expires_at      timestamptz NOT NULL default (now() + interval '24 hours')
```

### `session_notes`
```sql
id              uuid PK default gen_random_uuid()
session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
counselor_id    uuid NULL
career_goal     text NOT NULL default ''
interests       text NOT NULL default ''
financial       text NOT NULL default ''
concerns        text NOT NULL default ''
impression      text NOT NULL default ''
created_at, updated_at timestamptz
```

### `extraction_results`
```sql
id                   uuid PK
session_id           uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
counselor_id         uuid NULL
document_type        text NOT NULL CHECK (IN 'ncae', 'form_137', 'nat')
raw_gemini_response  jsonb NULL                        -- full Gemini response, for audit
structured_data      jsonb NOT NULL                    -- ExtractedAcademicData
redacted_image_path  text NULL                         -- storage path (not signed URL)
created_at           timestamptz NOT NULL default now()
```

### `correction_logs`
```sql
id                   uuid PK
session_id           uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
field_name           text NOT NULL                     -- e.g. 'ncae_strand.Math'
extracted_value      text NULL                         -- what Gemini said
corrected_value      text NOT NULL                     -- what the counselor wrote
correction_timestamp timestamptz NOT NULL default now()
```

**Indexes** (foreign-key indexes, per Supabase Postgres best practices):
`idx_session_notes_session_id`, `idx_extraction_results_session_id`, `idx_correction_logs_session_id`.

### Storage

**Bucket:** `kumpas-documents`
- Private (not public)
- 10 MB file size limit
- Allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- Object path: `<sessionId>/<docId>.jpg`
- Policy: `service_role` full access to objects in this bucket

---

## 7. API Reference

### `POST /api/sessions`
Creates a session and an empty `session_notes` row.

**Request:** empty body
**Response:** `200`
```json
{ "sessionId": "<uuid>", "expiresAt": "<ISO 8601>" }
```
**Errors:** `500` `{ "error": "Failed to initialize session" }`

### `POST /api/sessions/[sessionId]/upload`
Full upload pipeline.

**Request:** `multipart/form-data`
- `file` — image or PDF, ≤ 10 MB
- `docType` — `"ncae" | "form_137" | "nat"`

**Response:** `200`
```json
{
  "documentId": "<uuid>",
  "extractionResultId": "<uuid>",
  "docType": "ncae",
  "structuredData": { "type": "ncae", "data": { ... } },
  "redactedImageUrl": "<30-min signed URL>",
  "piiCount": 7,
  "status": "complete"
}
```

**Errors:**
- `400` Missing `file`/`docType`, or invalid `docType`
- `413` File exceeds 10 MB
- `500` Gemini/sharp/Supabase failure (error message in body)

### `POST /api/sessions/[sessionId]/approve`
Persists the approved profile and correction diffs.

**Request:** `application/json`
```json
{
  "counselorNotes": {
    "careerGoal":  "<HTML>",
    "interests":   "<HTML>",
    "financial":   "<HTML>",
    "concerns":    "<HTML>",
    "impression":  "<HTML>"
  },
  "corrections": [
    { "session_id": "<uuid>",
      "field_name": "ncae_strand.Math",
      "extracted_value": "78",
      "corrected_value": "82" }
  ]
}
```

**Response:** `200`
```json
{ "approvedProfile": { ... }, "status": "approved" }
```

**Errors:**
- `400` Missing `counselorNotes`, or any of the five fields blank after `stripHtml` — the route HTML-strips before checking.
- `500` Supabase failure

---

## 8. Service Layer

### `SessionInitializationService`
Methods: `createSession(counselorId?)`, `createSessionNotes(sessionId, counselorId?)`, `updateLastActivity(sessionId)`. `updateLastActivity` is called at the end of every upload to keep the 24-hour expiry sliding.

### `PIIRedactionService`
Pass 1 prompt explicitly lists PII categories for Philippine school documents (LRN, parent names, addresses) and explicitly *excludes* subject names, grade values, agency headings — preventing the redactor from blacking out the data we're about to extract. Returns `box_2d` in Gemini's standard `[ymin, xmin, ymax, xmax]` 0..1000 normalized format. Pass 2 denormalizes against image dimensions from `sharp.metadata()`, adds 4 px padding on each side, composites SVG black rectangles, and re-encodes as JPEG at quality 90.

If Gemini returns `pii_regions: []`, the image is still re-encoded through `sharp` so the downstream buffer is JPEG-normalized.

### `DocumentStorageService`
30-minute signed URLs. `upsert: true` so retries don't fail on the same path.

### `GeminiExtractionService`
One prompt per `docType`. All prompts: (a) return strict JSON, (b) instruct the model *not* to include any names/birthdates/IDs (belt-and-suspenders even though the image is already redacted). Raw Gemini response is persisted in `raw_gemini_response` for audit.

### `StudentProfileBuilder`
Reads all `extraction_results` for the session, normalizes them into `ApprovedProfile.academicData`, writes `sessions.approved_profile`, updates `session_notes`, and inserts a row per correction. No row is inserted into `correction_logs` if `corrections.length === 0`.

---

## 9. Frontend Components

### Component hierarchy
```
InputContainer
├─ (notes section)
│  ├─ Tabs: Image | Manual
│  ├─ Image tab: file dropzone + WysiwygField × 5 (after AI extraction)
│  └─ Manual tab: EditableFieldForm → SessionNotesForm → WysiwygField × 5
├─ DocumentUploadPanel
│  └─ FileSlot × 3
├─ ExtractionResultsPanel (only if uploadedDocs.length > 0)
│  ├─ Tabs (only if > 1 doc)
│  └─ DocEditor
│     ├─ Redacted-image toggle preview
│     └─ NCAEEditor | NATEditor | Form137Editor
└─ ConfirmationApprovalBar
```

### State held by `InputContainer`
- `sessionId` — from `POST /api/sessions` on mount
- `slotFiles`, `slotTypes`, `slotProcessing` — per-slot {1,2,3} state
- `uploadedDocs: UploadedDocument[]` — successfully extracted documents; the *original* extraction is preserved in `originalExtractedData` so we can compute a diff on approval
- `activeTab` (`image`/`manual`), `imageSectionHtml`, `manualSectionHtml`
- `isSubmitting` — disables CTA during approval

### Correction-diff computation (input-container.tsx, `handleApprove`)
Walks every `uploadedDoc`; for matching types, compares each numeric field between current and original. Each diff becomes one `CorrectionLog`:
- NCAE → `field_name: "ncae_strand.<strand>"`
- NAT → `field_name: "nat_subject.<subject>"`
- Form 137 → `field_name: "form137_subject.<subject_name>"`

`extracted_value` is the *original* (what Gemini returned); `corrected_value` is the current (what the counselor edited to).

---

## 10. Environment & Configuration

**File:** `.env` (not `.env.local` in this repo)

```
NEXT_PUBLIC_SUPABASE_URL=https://xdustjhnyyuxkeskwdpc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
DOCUMENT_INTAKE_API_KEY=<Gemini API key>
```

**Supabase project:** `xdustjhnyyuxkeskwdpc`
**Gemini model:** `gemini-2.5-flash` (both passes)

The service-role key bypasses RLS. `src/lib/supabase.ts` exports two named clients; `supabaseAdmin` is server-only and must never be imported from a `"use client"` file.

---

## 11. Build & Verification

### What was verified
- ✅ `bun run build` completes without TypeScript errors after each task and at the end
- ✅ All three new routes register: `/api/sessions`, `/api/sessions/[sessionId]/upload`, `/api/sessions/[sessionId]/approve`
- ✅ All 11 static pages still build
- ✅ Migration applied via Supabase MCP; all four tables exist; bucket exists

### What was NOT verified
- ❌ End-to-end browser walkthrough (plan Task 15 Step 3)
- ❌ Upload integration test with a real document (plan Task 8 Step 2 and Task 9 Step 3)
- ❌ Performance / Gemini latency under realistic image sizes

### Suggested manual walkthrough
1. `bun run dev`
2. Open `http://localhost:3000/input` — "Initializing session…" should flash, then disappear.
3. Confirm a row appeared in Supabase `sessions` (status `active`, `approved_profile` null).
4. **Manual tab:** fill all five fields → CTA enables. Leave one empty → CTA disables.
5. Upload `test/NCAE-results.png` (or any test fixture) → loading state → "Document 1 extracted, PII redacted server-side" toast.
6. Open the redacted image preview from `ExtractionResultsPanel` — black bars should cover names/LRN/etc.
7. Edit a strand score (e.g. change 78 → 82) → click "Begin Multi Agent Analysis" → navigate to `/analysis?session=<id>`.
8. Verify Supabase:
   ```sql
   SELECT id, status, approved_profile IS NOT NULL AS approved
   FROM public.sessions ORDER BY created_at DESC LIMIT 3;

   SELECT field_name, extracted_value, corrected_value
   FROM public.correction_logs ORDER BY correction_timestamp DESC LIMIT 5;
   ```

---

## 12. Outstanding Work

| # | Item | Owner / next step |
|---|---|---|
| A | **Git commits not made.** Git identity (`user.email`, `user.name`) is unset on this WSL workstation. Set them, then stage and commit per the plan's per-task commit messages (or one squash commit if preferred). | Carl |
| B | Manual browser walkthrough (§11 above) | Carl |
| C | **PR description must call out deviation #6** — raw image is sent to Gemini Vision pass-1 for PII detection. | Carl (when opening PR) |
| D | `/analysis?session=<id>` route exists but currently runs against the *pre*-Module-2 state shape; consumers of `ApprovedProfile` may need to adapt once Module 3 wiring catches up. | Module 3 |
| E | Module 5 will: switch `supabaseAdmin` calls in API routes to RLS-respecting `supabaseAnon` (with the user's session JWT), populate `counselor_id`, and tighten the policies that are already authored. | Module 5 |

---

## 13. Module 5 Hooks (forward-looking)

The schema and policies are **auth-ready**. When Module 5 implements counselor authentication, these specific changes will activate the deferred RLS:

1. Add `counselor_id uuid NOT NULL REFERENCES auth.users(id)` (drop the NULL) via a new migration after the user model exists.
2. Have API routes read the counselor's JWT from cookies (e.g. via `@supabase/ssr`) and pass it to a *user-context* Supabase client instead of `supabaseAdmin`.
3. The existing `*_own` policies (`counselor_id = (select auth.uid())`) will immediately enforce per-counselor isolation with no further policy work.

The migration also already wraps `auth.uid()` in `(select ...)` per Supabase RLS-performance best practice — the planner caches it instead of evaluating per row.

---

## 14. References

- Plan: [`docs/superpowers/plans/2026-05-23-module-2-implementation.md`](../plans/2026-05-23-module-2-implementation.md)
- SDD §2: Module 2 Component Specifications
- SRS 2.2 (Use Case), 3.1.2 (Privacy/PII)
- Gemini Vision spatial understanding (`box_2d` format, 0..1000 normalized)
- Supabase RLS-performance guidance (`(select auth.uid())` wrap)

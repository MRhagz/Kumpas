# SW-03 academic upload validation

## Baseline and decisions

Initial audit baseline on 4 November 2026: `8eae99156d68a190ae78dc494fb68abd52b73c2a`. Re-fetched and integrated current main at `ee71c55196006330b090f50ba4e7d8b206f39afc` on 5 November, preserving the merged SW-01, SW-04 and SW-09 changes. Delivery is `sw-03` into `main`.

The linked [SRS](https://drive.google.com/file/d/1tKAG3mu-d8_xhZz9duK18cTJd1wATGa7/view) hardware interface and Module 2.1, [SDD](https://drive.google.com/file/d/18JvD2dwOyBexfF_KT8Ii63ZafnIRGWji/view) Module 2.1 upload/controller/storage descriptions, [STD](https://drive.google.com/file/d/1ONizu5Qj3_oeUWu60Ib9ckCz8UZTI6oR/view) F02/F03/R02 and KMP-DEF-003, [RTM](https://drive.google.com/file/d/1AtCZ_F99wU8DOiJQ41wZ-K73APL8cTUy/view) KMP-FR-002, and [MVP findings](https://drive.google.com/file/d/1glj9QYVZs-DxpGC1NxUxDwO0rGnw4AnL/view) were read from their Drive sources. No submission documents were edited.

The team confirmed **10 MB = 10,000,000 bytes**, inclusive, on 4 November 2026. The team also approved all-page PDF rendering in SW-03 and recording the Vercel ingress limitation under SW-30. These decisions preserve the requirement rather than reducing it to the hosting limit.

Grade 10/SHS counselor operation and optional academic inputs are unchanged. This PR does not implement notes-field changes, application-hosted PII detection, extraction accuracy/provenance, immutable profile versions, full draft recovery, or the release verification assigned to other tracker tasks.

## Upload contract

- Both academic routes accept exactly one multipart `file` and `docType` (`form_137`, `ncae`, `nat`). Unsupported categories, string-valued files and duplicate fields return 400.
- File bytes, rather than extensions, determine the format. JPEG, PNG and WEBP undergo full Sharp decoding. PDF.js parses every PDF page and its operators. Empty, unsupported, corrupt, password-protected and mismatched-MIME inputs receive actionable 400/415 errors before redaction, storage or extraction. A missing/generic browser MIME is inferred from decoded content.
- `src/lib/academic-upload-policy.ts` defines the inclusive 10,000,000-byte file limit, UI message and a **10,065,536-byte multipart envelope**. The additional 65,536 bytes cover multipart metadata, not additional file content. Both declared and streamed body sizes are checked. Files over the file limit and bodies over the envelope return 413; malformed multipart returns 400. Recognized upstream body-limit errors also return actionable 413.
- Main's SW-01 `proxy.ts` matches page routes only, so academic uploads already bypass body cloning. This PR preserves that matcher and its invited-counselor checks. Upload handlers authenticate independently; session uploads/removal also check ownership. Next 16.2.6 drops entire chunks at its clone cap, so raising that cap by one byte would be insufficient for reliable chunked-body errors.
- Valid PDFs are rendered **in full page order**, left to right and then top to bottom, into one JPEG for the existing image-only redaction/storage/extraction path. Rendering uses up to 2x page scale with approximately 16 million aggregate pixels to bound decoded memory. No pages are silently dropped. Very long/dense documents may lose legibility when scaled; extraction quality remains subject to F03/F06 and counselor review. PDF fonts, CMaps and WASM resources resolve from the installed package, with no CDN dependency.
- The legacy `/api/extract-document` endpoint is request-local and applies the same validation. Session slot cardinality applies to the persistent `/api/sessions/[sessionId]/upload` endpoint.

## Selection, replacement and removal

The database permits one extraction row per `(session_id, document_type)`. Before external processing, an upload reserves that row using a token and a ten-minute lease. New reservations contain no academic values. Successful extraction commits only if its token still owns the reservation. The route has a 300-second maximum duration; a crashed invocation's reservation can be reclaimed after the lease expires, and its late result cannot commit or remove the new reservation.

An occupied slot requires `replaceDocumentId` matching its current redacted document. No implicit upsert chooses a winner. Old structured values and the old image remain until successful replacement; processing failures release the reservation and delete only the new image. A successful replacement updates the same row and removes the old image. Stale, duplicate and overlapping submissions return 409 before extraction.

`DELETE /api/sessions/[sessionId]/upload?docType=nat&documentId=<current-id>` removes the extraction row under the same reservation guard and attempts image cleanup. The UI removes its selection only after success, prevents type changes on occupied slots, and blocks editing during processing. Selected pending/failed uploads block approval; zero academic files do not. The server also rejects approval while a live upload/removal reservation exists.

Storage cleanup failures log an operation-only diagnostic. They do not reintroduce deleted structured values or roll back a committed replacement. Durable cleanup/retry tracking remains part of the later lifecycle work.

## Migration and runtime effects

Apply `supabase/migrations/20261104144015_sw03_academic_upload_validation.sql` **before** deploying the application:

1. Check for duplicate `(session_id, document_type)` rows. The migration deliberately stops if any exist; have the owning counselor/team resolve the intended selection. It never deletes existing records or silently picks one.
2. Create the unique index and add nullable `upload_token` / `upload_expires_at` columns. Existing single records remain intact.
3. Set the private document bucket limit to 10,000,000 bytes.

The migration adds no roles, policies, credentials or environment variables. It does not apply to a hosted database automatically. Deploy during a quiet intake window; old application instances cannot use the new replacement contract. For rollback, restore application and schema together; do not leave old insert-only code writing against new slot reservations.

Dependencies explicitly include the Sharp decoder and Node canvas runtime. The server's `academic-pdfjs` alias uses a patched version; the existing browser OCR dependency stays unchanged. Main's newer Vitest 5, jsdom and Node types are preserved. Node **22.13 or newer** is required by the server PDF.js package; CI uses Node 22. Native Sharp/canvas packages must be installed for the deployment platform. External server packages and explicit resource tracing preserve worker/resource resolution. Upload tests use `vitest.upload.config.mts`, alongside the unchanged notes/access configurations.

**SW-30 rollout blocker:** [Vercel Functions limits](https://vercel.com/docs/functions/limitations#request-body-size) cap request payloads at 4.5 MB before this handler runs. A Next.js body-limit setting cannot make the current Vercel ingress accept 10 MB. The team agreed to coordinate a compatible ingress/runtime under SW-30. Do not assert deployed 10 MB acceptance or close KMP-DEF-003 from local route tests alone. Use an ingress that forwards the full multipart envelope and retest the deployed boundary and error response. The client supplies a useful fallback for non-JSON platform 413 responses.

## Verification

Run:

```powershell
npm ci
npm run test:upload
npm run lint:upload
npx next typegen
npx tsc --noEmit --pretty false
npm run build
```

Verified on 5 November 2026 after integrating current main:

| Command | Outcome |
| --- | --- |
| `npm run test:upload` | 54 tests passed in six files. |
| `npm run test:access` | 232 tests passed in ten files, including the new DELETE route's access inventory. Some upload tests also run in this suite. |
| `npm test` | 28 notes-contract tests passed in two files. |
| `npm run lint:upload` | Passed with zero errors and warnings. |
| `npx next typegen` | Passed. |
| `npx tsc --noEmit --pretty false` | Passed. |
| `npm install --ignore-scripts --no-audit --no-fund` | Passed with main's newer test dependencies; regenerated the lockfile. |
| `npm run build` | Passed with the explicit test-only environment below; production credentials were unavailable. |
| `npm run lint` | Failed: eight errors and 16 warnings in the existing full-repository lint baseline. Changed files have zero lint errors. |
| `git diff --check` | Passed. |

Build environment (placeholders, not production credentials):

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='https://sw03-build.invalid'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='sw03-build-placeholder'
$env:SUPABASE_SERVICE_ROLE_KEY='sw03-build-placeholder'
npm run build
```

The upload-route trace includes the PDF worker, fonts, CMaps, WASM assets and native canvas binary. A direct invocation of the emitted Turbopack renderer also produced an 80×40 JPEG with both synthetic PDF pages in the correct order. This caught a bundler issue where `require.resolve` became a numeric module ID; resource lookup now uses the traced assets under the application working directory. Launch Next from the app/standalone root.

A build without Supabase settings could not collect page data; the placeholder build verifies bundling, not live integrations. A cached-build attempt failed in unchanged Google-font resolution; after preserving that generated cache outside the repository, the standard build passed. The earlier npm peer-resolution workaround was removed when integrating main's newer test runner. Lockfile regeneration retains main's dependency choices and adds the upload runtime packages.

Tests use synthetic documents, real content decoders and an embedded Postgres engine for migration/reservation/concurrency assertions. Route tests mock authentication, storage and AI boundaries and verify rejected requests make no extraction/redaction calls. UI tests exercise single selection, byte limits, explicit replacement/removal and pending-input approval. No student documents or provider credentials are used.

These checks do not prove hosted Supabase migration/Storage behavior, Vercel ingress acceptance, live Gemini extraction, all browser variants, independent human retest, or complete STD F02/F03/R02 execution. Human review, passing required checks, merge into main and deployed verification remain required before marking the tracker task done.

# Module 2 — Document Intake & Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all Module 2 SDD §2 components — Document Intake, Automatic Redaction, AI Extraction, Counselor Confirmation — with Supabase session persistence and server-side PII redaction.

**Architecture:** Three-layer: React frontend → Next.js App Router API routes → Supabase (postgres + storage) + Gemini API. Session lifecycle is anchored in Supabase. Two-pass Gemini Vision: pass 1 returns PII bounding boxes, `sharp` blacks them out, pass 2 performs structured extraction on the redacted image.

**Tech Stack:** Next.js 16.2.6 App Router, TypeScript, Supabase (@supabase/supabase-js 2.106.1), Gemini 2.5 Flash (Vision + structured output), sharp 0.34.5

---

## Stated Deviations from SDD/SRS

| # | Source clause | Deviation | Reason |
|---|---|---|---|
| 1 | PIIRedactionService is an async background worker consuming from a message queue | **Synchronous** — runs inside the upload request handler | Vercel has no persistent process or queue primitive |
| 2 | FileUploadController returns 202 Accepted; UploadStatusIndicator uses SSE | API returns **when complete**; indicator shows loading state during request | Follows from deviation #1 |
| 3 | DocumentStorageService stores raw images in `/tmp` then deletes | Raw images held as **in-memory Buffer** only (never written to disk) | Safer; redaction completes in same request so cross-invocation handoff is not needed |
| 4 | RLS enforces `counselor_id = auth.uid()` | `counselor_id` is **nullable**; service role key is used; RLS policies are created but auth enforcement deferred to Module 5 | Module 5 implements auth |
| 5 | ExtractionResultsPanel is described as "read-only" | Panel **allows field-level editing** of extracted values | SRS 2.2 step 5 explicitly requires counselor to edit and correct misidentified values; SRS takes precedence over SDD description |
| 6 | **SRS 3.1.2** — "Under no circumstances shall unredacted document content be submitted to the Gemini API"; SDD §2.4 — raw image is *not* sent to Gemini | **Raw image is sent to Gemini Vision** in pass 1 to obtain PII bounding boxes. Sharp then composites black rectangles. Only the redacted image is used for the structured-extraction pass 2 and stored in Supabase Storage. | Team vendor evaluation (per teammate's report) showed Gemini Vision PII detection materially outperforms Tesseract.js on Philippine documents. Mitigated by Google Gemini paid-tier no-retention guarantee. **This deviation must be called out in the Module 2 PR description.** |

---

## SDD Component Checklist

### Module 2.1 Front-end
- [ ] `DocumentUploadPanel`
- [ ] `SessionNotesForm`
- [ ] `UploadStatusIndicator`

### Module 2.1 Back-end
- [ ] `FileUploadController`
- [ ] `PIIRedactionService`
- [ ] `DocumentStorageService`
- [ ] `SessionInitializationService`

### Module 2.2 Front-end
- [ ] `ExtractionResultsPanel`
- [ ] `EditableFieldForm`
- [ ] `ConfirmationApprovalBar`

### Module 2.2 Back-end
- [ ] `GeminiExtractionService`
- [ ] `StudentProfileBuilder`

### Database
- [ ] `sessions` table
- [ ] `session_notes` table
- [ ] `extraction_results` table
- [ ] `correction_logs` table
- [ ] Supabase Storage bucket: `kumpas-documents`

---

## File Structure

```
src/
  lib/
    supabase.ts
    module2/
      session-initialization-service.ts
      pii-redaction-service.ts
      document-storage-service.ts
      gemini-extraction-service.ts
      student-profile-builder.ts
  app/
    api/
      sessions/
        route.ts                              # POST → create session
        [sessionId]/
          upload/route.ts                     # POST → FileUploadController
          approve/route.ts                    # POST → StudentProfileBuilder
  components/
    input/
      document-upload-panel.tsx
      session-notes-form.tsx
      upload-status-indicator.tsx
      extraction-results-panel.tsx
      editable-field-form.tsx
      confirmation-approval-bar.tsx
      # existing files modified: input-container.tsx
supabase/migrations/20260523000000_module2_sessions.sql
```

---

## Task 1: Environment Variables and Supabase Client

**Files:**
- Modify: `.env.local`
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Add Supabase env vars to .env.local**

  The project URL and anon key are known. The service role key must be retrieved from the Supabase dashboard → Project Settings → API → `service_role`.

  ```
  NEXT_PUBLIC_SUPABASE_URL=https://xdustjhnyyuxkeskwdpc.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkdXN0amhueXl1eGtlc2t3ZHBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDAyMjYsImV4cCI6MjA5NTAxNjIyNn0.ZrHIl-cWG9X3RKb1QZKcOGwTiR6XTRMvnkBJUqU6iVE
  SUPABASE_SERVICE_ROLE_KEY=<get from Supabase dashboard>
  ```

- [ ] **Step 2: Create `src/lib/supabase.ts`**

  ```ts
  import { createClient } from '@supabase/supabase-js';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Client-safe anon client (respects RLS)
  export const supabaseAnon = createClient(url, anonKey);

  // Server-only service role client (bypasses RLS — never import in "use client" files)
  export const supabaseAdmin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  bun run build 2>&1 | head -30
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/supabase.ts
  git commit -m "feat(module2): add Supabase client"
  ```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260523000000_module2_sessions.sql`

- [ ] **Step 1: Write and apply the migration**

  Apply the following SQL via the Supabase MCP `apply_migration` tool (project_id: `xdustjhnyyuxkeskwdpc`):

  ```sql
  -- sessions: durable session store (SDD §5.1)
  CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    counselor_id UUID,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
    approved_profile JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
  );

  -- session_notes: counselor qualitative input
  CREATE TABLE IF NOT EXISTS public.session_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    counselor_id UUID,
    career_goal TEXT NOT NULL DEFAULT '',
    interests TEXT NOT NULL DEFAULT '',
    financial TEXT NOT NULL DEFAULT '',
    concerns TEXT NOT NULL DEFAULT '',
    impression TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- extraction_results: structured academic data from Gemini
  CREATE TABLE IF NOT EXISTS public.extraction_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    counselor_id UUID,
    document_type TEXT NOT NULL CHECK (document_type IN ('ncae', 'form_137', 'nat')),
    raw_gemini_response JSONB,
    structured_data JSONB NOT NULL,
    redacted_image_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- correction_logs: field-level counselor corrections (SDD §5.2)
  CREATE TABLE IF NOT EXISTS public.correction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    extracted_value TEXT,
    corrected_value TEXT NOT NULL,
    correction_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- RLS enabled; policies ready for Module 5 auth
  ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.session_notes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.extraction_results ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.correction_logs ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "sessions_own" ON public.sessions
    FOR ALL TO authenticated USING (counselor_id = auth.uid());
  CREATE POLICY "session_notes_own" ON public.session_notes
    FOR ALL TO authenticated USING (counselor_id = auth.uid());
  CREATE POLICY "extraction_results_own" ON public.extraction_results
    FOR ALL TO authenticated USING (counselor_id = auth.uid());
  CREATE POLICY "correction_logs_own" ON public.correction_logs
    FOR ALL TO authenticated
    USING (session_id IN (SELECT id FROM public.sessions WHERE counselor_id = auth.uid()));

  -- Storage bucket for redacted document images
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('kumpas-documents', 'kumpas-documents', false, 10485760,
    ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
  ON CONFLICT (id) DO NOTHING;

  CREATE POLICY "service_role_documents" ON storage.objects
    FOR ALL TO service_role
    USING (bucket_id = 'kumpas-documents')
    WITH CHECK (bucket_id = 'kumpas-documents');
  ```

- [ ] **Step 2: Verify tables exist**

  Run via MCP execute_sql:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name;
  ```
  Expected: `correction_logs`, `extraction_results`, `session_notes`, `sessions`

- [ ] **Step 3: Save migration file and commit**

  Save the SQL above to `supabase/migrations/20260523000000_module2_sessions.sql`, then:
  ```bash
  git add supabase/migrations/20260523000000_module2_sessions.sql
  git commit -m "feat(module2): add sessions, extraction_results, session_notes, correction_logs tables"
  ```

---

## Task 3: New Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Append Module 2 types to `src/types.ts`**

  ```ts
  /* ─── Module 2 types ─── */

  export interface Session {
    id: string;
    counselor_id: string | null;
    status: 'active' | 'completed' | 'expired' | 'cancelled';
    approved_profile: ApprovedProfile | null;
    created_at: string;
    last_activity: string;
    expires_at: string;
  }

  export interface SessionNotes {
    id: string;
    session_id: string;
    career_goal: string;
    interests: string;
    financial: string;
    concerns: string;
    impression: string;
  }

  export interface ExtractionResult {
    id: string;
    session_id: string;
    document_type: 'ncae' | 'form_137' | 'nat';
    structured_data: ExtractedAcademicData;
    redacted_image_path: string | null;
    created_at: string;
  }

  export interface CorrectionLog {
    session_id: string;
    field_name: string;
    extracted_value: string | null;
    corrected_value: string;
  }

  export interface ApprovedProfile {
    sessionId: string;
    sessionTimestamp: string;
    counselorNotes: {
      careerGoal: string;
      interests: string;
      financial: string;
      concerns: string;
      impression: string;
    };
    academicData: {
      ncae?: NCAEData;
      form137?: Form137Data;
      nat?: NATData;
    };
  }

  export interface UploadedDocument {
    documentId: string;
    slotIndex: 1 | 2 | 3;
    docType: string;
    extractedData: ExtractedAcademicData;
    redactedImageUrl: string | null;
    originalExtractedData: ExtractedAcademicData;
  }
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  bun run build 2>&1 | grep "error TS" | head -10
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/types.ts
  git commit -m "feat(module2): add Session, ApprovedProfile, UploadedDocument types"
  ```

---

## Task 4: SessionInitializationService + POST /api/sessions

**Files:**
- Create: `src/lib/module2/session-initialization-service.ts`
- Create: `src/app/api/sessions/route.ts`

- [ ] **Step 1: Create `src/lib/module2/session-initialization-service.ts`**

  ```ts
  import { supabaseAdmin } from '@/lib/supabase';
  import type { Session } from '@/types';

  export class SessionInitializationService {
    async createSession(counselorId?: string): Promise<Session> {
      const { data, error } = await supabaseAdmin
        .from('sessions')
        .insert({ counselor_id: counselorId ?? null, status: 'active' })
        .select()
        .single();
      if (error) throw new Error(`Failed to create session: ${error.message}`);
      return data as Session;
    }

    async createSessionNotes(sessionId: string, counselorId?: string): Promise<void> {
      const { error } = await supabaseAdmin.from('session_notes').insert({
        session_id: sessionId,
        counselor_id: counselorId ?? null,
        career_goal: '', interests: '', financial: '', concerns: '', impression: '',
      });
      if (error) throw new Error(`Failed to create session notes: ${error.message}`);
    }

    async updateLastActivity(sessionId: string): Promise<void> {
      await supabaseAdmin
        .from('sessions')
        .update({ last_activity: new Date().toISOString() })
        .eq('id', sessionId);
    }
  }

  export const sessionInitializationService = new SessionInitializationService();
  ```

- [ ] **Step 2: Create `src/app/api/sessions/route.ts`**

  ```ts
  import { type NextRequest } from 'next/server';
  import { sessionInitializationService } from '@/lib/module2/session-initialization-service';

  export async function POST(_request: NextRequest) {
    try {
      const session = await sessionInitializationService.createSession();
      await sessionInitializationService.createSessionNotes(session.id);
      return Response.json({ sessionId: session.id, expiresAt: session.expires_at });
    } catch (err) {
      console.error('[POST /api/sessions]', err);
      return Response.json({ error: 'Failed to initialize session' }, { status: 500 });
    }
  }
  ```

- [ ] **Step 3: Integration test**

  ```bash
  # Start dev server first: bun run dev
  curl -s -X POST http://localhost:3000/api/sessions | python3 -m json.tool
  ```
  Expected: `{ "sessionId": "<uuid>", "expiresAt": "<ISO>" }`

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/module2/session-initialization-service.ts src/app/api/sessions/route.ts
  git commit -m "feat(module2): add SessionInitializationService and POST /api/sessions"
  ```

---

## Task 5: PIIRedactionService (Gemini Vision two-pass)

**Files:**
- Create: `src/lib/module2/pii-redaction-service.ts`

Two-pass approach using Gemini 2.5 Vision spatial understanding:
1. Send the raw image to Gemini with a prompt asking for PII bounding boxes (`box_2d` in `[ymin, xmin, ymax, xmax]` normalized 0–1000 per the Gemini Vision spec).
2. Parse the boxes, denormalize to pixel coordinates using image dimensions from `sharp`, and composite black SVG rectangles to produce the redacted buffer.

The redacted buffer is what `GeminiExtractionService` (Task 7) sends for structured extraction. The raw buffer is discarded after redaction.

**SRS deviation:** see deviation #6 in the table at the top of this plan.

- [ ] **Step 1: Create `src/lib/module2/pii-redaction-service.ts`**

  ```ts
  import sharp from 'sharp';

  const GEMINI_API_KEY = process.env.DOCUMENT_INTAKE_API_KEY!;
  const GEMINI_MODEL = 'gemini-2.5-flash';
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const PII_DETECTION_PROMPT = `You are a PII detector for Philippine student documents (Form 137, NCAE, NAT).

Find every personally identifiable information (PII) region in the image and return its bounding box. PII includes:
- Student names, parent or guardian names
- Birthdates, birth dates, or date-of-birth values
- Learner Reference Numbers (LRN, 12 digits)
- Any student ID numbers
- Home addresses
- Phone numbers, email addresses
- Specific school names tied to the student (not government agency names like "DepEd" or "Department of Education")

Do NOT mark subject names, grade values, score values, agency headings, or document titles as PII.

Return ONLY this JSON, no prose:
{
  "pii_regions": [
    { "type": "<name|parent_name|birthdate|lrn|student_id|address|phone|email|school_name>",
      "text": "<the exact PII text visible>",
      "box_2d": [ymin, xmin, ymax, xmax] }
  ]
}

box_2d uses Gemini's standard spatial format: integers in 0..1000, normalized to the image's height and width. ymin/ymax are vertical, xmin/xmax are horizontal. If no PII is found, return { "pii_regions": [] }.`;

  interface PIIRegion {
    type: string;
    text: string;
    box_2d: [number, number, number, number];  // [ymin, xmin, ymax, xmax], 0..1000
  }

  export interface RedactionResult {
    redactedBuffer: Buffer;
    piiCount: number;
    piiRegions: PIIRegion[];
  }

  export class PIIRedactionService {
    async redact(imageBuffer: Buffer, mimeType: string): Promise<RedactionResult> {
      // Pass 1: ask Gemini Vision for PII bounding boxes
      const base64 = imageBuffer.toString('base64');

      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: PII_DETECTION_PROMPT },
              { inlineData: { mimeType, data: base64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.0,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gemini PII detection failed: ${detail}`);
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      let parsed: { pii_regions?: PIIRegion[] };
      try {
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error(`Failed to parse Gemini PII response: ${rawText.slice(0, 200)}`);
      }

      const regions = parsed.pii_regions ?? [];

      if (regions.length === 0) {
        // No PII detected — still re-encode through sharp so the buffer is JPEG-normalized
        const passthrough = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
        return { redactedBuffer: passthrough, piiCount: 0, piiRegions: [] };
      }

      // Pass 2: composite black SVG rectangles over the PII regions
      const metadata = await sharp(imageBuffer).metadata();
      const imgWidth = metadata.width ?? 1;
      const imgHeight = metadata.height ?? 1;

      const pad = 4;
      const rects = regions.map(r => {
        const [ymin, xmin, ymax, xmax] = r.box_2d;
        const x = Math.round((xmin / 1000) * imgWidth) - pad;
        const y = Math.round((ymin / 1000) * imgHeight) - pad;
        const w = Math.round(((xmax - xmin) / 1000) * imgWidth) + pad * 2;
        const h = Math.round(((ymax - ymin) / 1000) * imgHeight) + pad * 2;
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black"/>`;
      }).join('');

      const svgOverlay = Buffer.from(
        `<svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`
      );

      const redactedBuffer = await sharp(imageBuffer)
        .composite([{ input: svgOverlay, top: 0, left: 0 }])
        .jpeg({ quality: 90 })
        .toBuffer();

      return { redactedBuffer, piiCount: regions.length, piiRegions: regions };
    }
  }

  export const piiRedactionService = new PIIRedactionService();
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  bun run build 2>&1 | grep "error TS" | head -10
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/module2/pii-redaction-service.ts
  git commit -m "feat(module2): add PIIRedactionService (Gemini Vision two-pass + sharp)"
  ```

---

## Task 6: DocumentStorageService

**Files:**
- Create: `src/lib/module2/document-storage-service.ts`

- [ ] **Step 1: Create `src/lib/module2/document-storage-service.ts`**

  ```ts
  import { supabaseAdmin } from '@/lib/supabase';

  const BUCKET = 'kumpas-documents';
  const SIGNED_URL_TTL = 30 * 60;  // 30 min

  export class DocumentStorageService {
    async storeRedacted(buffer: Buffer, sessionId: string, docId: string): Promise<string> {
      const storagePath = `${sessionId}/${docId}.jpg`;
      const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });
      if (error) throw new Error(`Failed to store redacted image: ${error.message}`);
      return storagePath;
    }

    async retrieveRedacted(storagePath: string): Promise<string> {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL);
      if (error) throw new Error(`Failed to create signed URL: ${error.message}`);
      return data.signedUrl;
    }

    async deleteRedacted(storagePath: string): Promise<void> {
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    }
  }

  export const documentStorageService = new DocumentStorageService();
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  bun run build 2>&1 | grep "error TS" | head -10
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/module2/document-storage-service.ts
  git commit -m "feat(module2): add DocumentStorageService (Supabase Storage)"
  ```

---

## Task 7: GeminiExtractionService

**Files:**
- Create: `src/lib/module2/gemini-extraction-service.ts`

Wraps the Gemini API call and persists results to `extraction_results`. The existing `/api/extract-document` route is left intact.

- [ ] **Step 1: Create `src/lib/module2/gemini-extraction-service.ts`**

  ```ts
  import { supabaseAdmin } from '@/lib/supabase';
  import type { ExtractedAcademicData, ExtractionResult } from '@/types';

  const GEMINI_API_KEY = process.env.DOCUMENT_INTAKE_API_KEY!;
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const PROMPTS: Record<string, string> = {
    ncae: `You are a data extraction specialist for Philippine NCAE result sheets. Extract and return only this JSON:
{"strand_scores":{"<strand_name>":<percentile_0_to_100>},"overall_percentile":<number|null>,"recommended_strand":"<string|null>"}
Known strands: General Scholastic Aptitude, Scientific Ability, Reading Comprehension, Mathematical Ability, Verbal Ability, Clerical Ability, Manipulative Skills, Non-Verbal Ability, Entrepreneurial Skills.
Do NOT include any names, birthdates, or IDs. Return ONLY the JSON object.`,

    form_137: `You are a data extraction specialist for Philippine Form 137 documents. Extract and return only this JSON:
{"subjects":[{"name":"<subject>","grade":<number>,"year":"<string>"}],"gwa":<number|null>,"school_year":"<string|null>"}
Grades are 60-100. Average multiple quarters. Do NOT include any names, birthdates, or IDs. Return ONLY the JSON object.`,

    nat: `You are a data extraction specialist for Philippine NAT score sheets. Extract and return only this JSON:
{"subjects":{"<subject>":<score>},"composite_score":<number|null>,"mastery_level":"<string|null>"}
Known subjects: Science, Mathematics, English, Filipino, Araling Panlipunan, HeKaSi, Critical Thinking.
Do NOT include any names, birthdates, or IDs. Return ONLY the JSON object.`,
  };

  export class GeminiExtractionService {
    async extract(
      imageBuffer: Buffer,
      docType: string,
      sessionId: string,
      redactedImagePath: string | null,
    ): Promise<ExtractionResult> {
      const prompt = PROMPTS[docType];
      if (!prompt) throw new Error(`Unsupported document type: ${docType}`);

      const base64 = imageBuffer.toString('base64');

      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64 } }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json' },
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gemini API error: ${detail}`);
      }

      const geminiData = await response.json();
      const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      let parsed: Record<string, unknown>;
      try {
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error(`Failed to parse Gemini response: ${rawText.slice(0, 200)}`);
      }

      const structuredData: ExtractedAcademicData = {
        type: docType as ExtractedAcademicData['type'],
        data: parsed as never,
      };

      const { data: saved, error } = await supabaseAdmin
        .from('extraction_results')
        .insert({
          session_id: sessionId,
          document_type: docType,
          raw_gemini_response: geminiData,
          structured_data: structuredData,
          redacted_image_path: redactedImagePath,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to save extraction result: ${error.message}`);
      return saved as ExtractionResult;
    }
  }

  export const geminiExtractionService = new GeminiExtractionService();
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  bun run build 2>&1 | grep "error TS" | head -10
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/module2/gemini-extraction-service.ts
  git commit -m "feat(module2): add GeminiExtractionService with extraction_results persistence"
  ```

---

## Task 8: FileUploadController

**Files:**
- Create: `src/app/api/sessions/[sessionId]/upload/route.ts`

The full pipeline in one request: receive → PII redact → store redacted → extract → return.

- [ ] **Step 1: Create `src/app/api/sessions/[sessionId]/upload/route.ts`**

  ```ts
  import { type NextRequest } from 'next/server';
  import { randomUUID } from 'node:crypto';
  import { piiRedactionService } from '@/lib/module2/pii-redaction-service';
  import { documentStorageService } from '@/lib/module2/document-storage-service';
  import { geminiExtractionService } from '@/lib/module2/gemini-extraction-service';
  import { sessionInitializationService } from '@/lib/module2/session-initialization-service';

  export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
  ) {
    const { sessionId } = await params;

    try {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const docType = formData.get('docType') as string | null;

      if (!file || !docType) {
        return Response.json({ error: 'Missing required fields: file, docType' }, { status: 400 });
      }
      if (!['ncae', 'form_137', 'nat'].includes(docType)) {
        return Response.json({ error: `Invalid docType: ${docType}` }, { status: 400 });
      }
      if (file.size > 10 * 1024 * 1024) {
        return Response.json({ error: 'File exceeds 10 MB limit' }, { status: 413 });
      }

      // Raw buffer stays in memory — never written to disk (SDD §2.5 privacy constraint)
      const rawBuffer = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || 'image/jpeg';

      // PIIRedactionService: redact PII from image before storing or extracting
      const { redactedBuffer, piiCount } = await piiRedactionService.redact(rawBuffer, mimeType);

      // DocumentStorageService: persist redacted image
      const docId = randomUUID();
      const redactedPath = await documentStorageService.storeRedacted(redactedBuffer, sessionId, docId);

      // GeminiExtractionService: extract structured academic data
      const extractionResult = await geminiExtractionService.extract(
        redactedBuffer,
        docType,
        sessionId,
        redactedPath,
      );

      // Generate signed URL for frontend redacted image preview
      const redactedImageUrl = await documentStorageService.retrieveRedacted(redactedPath);

      await sessionInitializationService.updateLastActivity(sessionId);

      return Response.json({
        documentId: docId,
        extractionResultId: extractionResult.id,
        docType,
        structuredData: extractionResult.structured_data,
        redactedImageUrl,
        piiCount,
        status: 'complete',
      });
    } catch (err) {
      console.error(`[upload route] sessionId=${sessionId}`, err);
      return Response.json(
        { error: err instanceof Error ? err.message : 'Upload processing failed' },
        { status: 500 }
      );
    }
  }
  ```

- [ ] **Step 2: Integration test**

  ```bash
  SESSION=$(curl -s -X POST http://localhost:3000/api/sessions | python3 -c "import sys,json; print(json.load(sys.stdin)['sessionId'])")
  curl -s -X POST "http://localhost:3000/api/sessions/$SESSION/upload" \
    -F "file=@/mnt/c/Users/smoll/Programming/swe/swe_Kumpas/test/NCAE-results.png" \
    -F "docType=ncae" | python3 -m json.tool
  ```
  Expected: JSON with `structuredData`, `redactedImageUrl`, `piiCount`, `status: "complete"`

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/sessions/[sessionId]/upload/route.ts
  git commit -m "feat(module2): add FileUploadController (upload → PII redact → extract pipeline)"
  ```

---

## Task 9: StudentProfileBuilder + POST /api/sessions/[sessionId]/approve

**Files:**
- Create: `src/lib/module2/student-profile-builder.ts`
- Create: `src/app/api/sessions/[sessionId]/approve/route.ts`

- [ ] **Step 1: Create `src/lib/module2/student-profile-builder.ts`**

  ```ts
  import { supabaseAdmin } from '@/lib/supabase';
  import type { ApprovedProfile, CorrectionLog, ExtractedAcademicData, NCAEData, Form137Data, NATData } from '@/types';

  interface ApproveInput {
    sessionId: string;
    counselorNotes: ApprovedProfile['counselorNotes'];
    corrections: CorrectionLog[];
  }

  export class StudentProfileBuilder {
    async buildAndSave(input: ApproveInput): Promise<ApprovedProfile> {
      const { sessionId, counselorNotes, corrections } = input;

      const { data: extractions } = await supabaseAdmin
        .from('extraction_results')
        .select('document_type, structured_data')
        .eq('session_id', sessionId);

      const academicData: ApprovedProfile['academicData'] = {};
      for (const ex of extractions ?? []) {
        const d = ex.structured_data as ExtractedAcademicData;
        if (d.type === 'ncae') academicData.ncae = d.data as NCAEData;
        if (d.type === 'form_137') academicData.form137 = d.data as Form137Data;
        if (d.type === 'nat') academicData.nat = d.data as NATData;
      }

      const profile: ApprovedProfile = {
        sessionId,
        sessionTimestamp: new Date().toISOString(),
        counselorNotes,
        academicData,
      };

      const { error: updateErr } = await supabaseAdmin
        .from('sessions')
        .update({ approved_profile: profile, last_activity: new Date().toISOString() })
        .eq('id', sessionId);
      if (updateErr) throw new Error(`Failed to save profile: ${updateErr.message}`);

      await supabaseAdmin.from('session_notes').update({
        career_goal: counselorNotes.careerGoal,
        interests: counselorNotes.interests,
        financial: counselorNotes.financial,
        concerns: counselorNotes.concerns,
        impression: counselorNotes.impression,
        updated_at: new Date().toISOString(),
      }).eq('session_id', sessionId);

      if (corrections.length > 0) {
        await supabaseAdmin.from('correction_logs').insert(
          corrections.map(c => ({
            session_id: sessionId,
            field_name: c.field_name,
            extracted_value: c.extracted_value ?? null,
            corrected_value: c.corrected_value,
          }))
        );
      }

      return profile;
    }
  }

  export const studentProfileBuilder = new StudentProfileBuilder();
  ```

- [ ] **Step 2: Create `src/app/api/sessions/[sessionId]/approve/route.ts`**

  ```ts
  import { type NextRequest } from 'next/server';
  import { studentProfileBuilder } from '@/lib/module2/student-profile-builder';
  import type { CorrectionLog, ApprovedProfile } from '@/types';

  interface ApproveBody {
    counselorNotes: ApprovedProfile['counselorNotes'];
    corrections?: CorrectionLog[];
  }

  export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
  ) {
    const { sessionId } = await params;
    try {
      const body = await request.json() as ApproveBody;
      const { counselorNotes, corrections = [] } = body;

      if (!counselorNotes) {
        return Response.json({ error: 'counselorNotes is required' }, { status: 400 });
      }

      const required = ['careerGoal', 'interests', 'financial', 'concerns', 'impression'] as const;
      for (const field of required) {
        if (!counselorNotes[field]?.trim()) {
          return Response.json({ error: `counselorNotes.${field} is required and cannot be empty` }, { status: 400 });
        }
      }

      const approvedProfile = await studentProfileBuilder.buildAndSave({ sessionId, counselorNotes, corrections });
      return Response.json({ approvedProfile, status: 'approved' });
    } catch (err) {
      console.error(`[approve route] sessionId=${sessionId}`, err);
      return Response.json({ error: err instanceof Error ? err.message : 'Approval failed' }, { status: 500 });
    }
  }
  ```

- [ ] **Step 3: Integration test**

  ```bash
  SESSION=$(curl -s -X POST http://localhost:3000/api/sessions | python3 -c "import sys,json; print(json.load(sys.stdin)['sessionId'])")
  curl -s -X POST "http://localhost:3000/api/sessions/$SESSION/approve" \
    -H "Content-Type: application/json" \
    -d '{"counselorNotes":{"careerGoal":"Nurse","interests":"Science","financial":"Stable","concerns":"Math low","impression":"Motivated"},"corrections":[]}' \
    | python3 -m json.tool
  ```
  Expected: `{ "approvedProfile": {...}, "status": "approved" }`

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/module2/student-profile-builder.ts src/app/api/sessions/[sessionId]/approve/route.ts
  git commit -m "feat(module2): add StudentProfileBuilder and POST /api/sessions/[sessionId]/approve"
  ```

---

## Task 10: UploadStatusIndicator Component

**Files:**
- Create: `src/components/input/upload-status-indicator.tsx`

- [ ] **Step 1: Create `src/components/input/upload-status-indicator.tsx`**

  ```tsx
  "use client";

  import { Check, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
  import type { DocumentProcessingState } from "@/types";

  const STEP_LABELS: Record<string, string> = {
    idle: "", ocr_scanning: "Scanning…", pii_detecting: "Detecting PII…",
    pii_redacting: "Redacting personal info…", structuring: "Structuring data…",
    ai_structuring: "AI extracting…", complete: "Extraction complete", error: "Extraction failed",
  };

  interface UploadStatusIndicatorProps {
    processingState: DocumentProcessingState;
    piiCount?: number;
  }

  export default function UploadStatusIndicator({ processingState, piiCount }: UploadStatusIndicatorProps) {
    const { step, progress, error } = processingState;
    if (step === "idle") return null;

    const isProcessing = !["idle", "complete", "error"].includes(step);
    const isComplete = step === "complete";
    const isError = step === "error";

    return (
      <div className={`border-t px-3 py-2.5 text-[12px] ${isError ? "border-red-soft/20 bg-red-light text-red-soft" : isComplete ? "border-sage/20 bg-sage/[0.04] text-sage" : "border-black/[0.06] bg-black/[0.01] text-charcoal-3"}`}>
        <div className="flex items-center gap-2">
          {isProcessing && <Loader2 size={13} className="animate-spin shrink-0" />}
          {isComplete && <ShieldCheck size={13} className="shrink-0" />}
          {isError && <AlertTriangle size={13} className="shrink-0" />}
          <span className="font-medium">{STEP_LABELS[step]}</span>
          {isComplete && (piiCount ?? 0) > 0 && (
            <span className="ml-auto flex items-center gap-1 text-[11px]">
              <Check size={11} /> {piiCount} PII redacted server-side
            </span>
          )}
          {isError && error && <span className="ml-1 font-normal opacity-80">— {error}</span>}
        </div>
        {isProcessing && (
          <div className="mt-1.5 h-1 w-full rounded-full bg-black/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-sage transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript, commit**

  ```bash
  bun run build 2>&1 | grep "error TS" | head -5
  git add src/components/input/upload-status-indicator.tsx
  git commit -m "feat(module2): add UploadStatusIndicator component"
  ```

---

## Task 11: DocumentUploadPanel Component

**Files:**
- Create: `src/components/input/document-upload-panel.tsx`

- [ ] **Step 1: Create `src/components/input/document-upload-panel.tsx`**

  ```tsx
  "use client";

  import { FolderOpen, Info } from "lucide-react";
  import FileSlot from "./file-slot";
  import type { DocumentProcessingState, UploadedDocument } from "@/types";

  interface SlotState { file: File | null; docType: string; processingState: DocumentProcessingState; }

  interface DocumentUploadPanelProps {
    sessionId: string;
    slots: { 1: SlotState; 2: SlotState; 3: SlotState };
    onSlotFileChange: (index: 1 | 2 | 3, file: File | null) => void;
    onSlotTypeChange: (index: 1 | 2 | 3, type: string) => void;
    onDocumentUploaded: (index: 1 | 2 | 3, result: UploadedDocument) => void;
    onUploadError: (index: 1 | 2 | 3, error: string) => void;
  }

  export default function DocumentUploadPanel({
    sessionId, slots, onSlotFileChange, onSlotTypeChange, onDocumentUploaded, onUploadError,
  }: DocumentUploadPanelProps) {
    const upload = async (index: 1 | 2 | 3, file: File, docType: string) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docType", docType);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/upload`, { method: "POST", body: fd });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Upload failed"); }
        const data = await res.json();
        onDocumentUploaded(index, {
          documentId: data.documentId,
          slotIndex: index,
          docType,
          extractedData: data.structuredData,
          redactedImageUrl: data.redactedImageUrl,
          originalExtractedData: structuredClone(data.structuredData),
        });
      } catch (err) {
        onUploadError(index, err instanceof Error ? err.message : "Upload failed");
      }
    };

    const handleFileChange = async (index: 1 | 2 | 3, file: File | null) => {
      onSlotFileChange(index, file);
      if (!file) return;
      const docType = slots[index].docType;
      if (docType) await upload(index, file, docType);
    };

    const handleTypeChange = async (index: 1 | 2 | 3, type: string) => {
      onSlotTypeChange(index, type);
      const file = slots[index].file;
      if (file && type) await upload(index, file, type);
    };

    const getExcluded = (index: 1 | 2 | 3) =>
      ([1, 2, 3] as const).filter(i => i !== index).map(i => slots[i].docType).filter(Boolean);

    return (
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ochre-pale text-ochre"><FolderOpen size={20} /></div>
          <div>
            <h2 className="text-base font-semibold text-ink leading-snug flex flex-wrap items-center gap-2">
              Supporting Documents
              <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] whitespace-nowrap font-bold uppercase tracking-wider text-muted-text">Optional — Max 3</span>
            </h2>
            <p className="mt-1 text-xs text-muted-text leading-relaxed">Upload student records to improve AI accuracy. PII is automatically redacted server-side before analysis.</p>
          </div>
        </div>
        <div className="flex items-start sm:items-center gap-2.5 rounded-lg bg-ochre-pale/60 border border-ochre/10 px-3 py-2.5 mb-4 text-xs text-ochre leading-snug">
          <Info size={14} className="shrink-0 mt-0.5 sm:mt-0" />
          <span>Accepted: NCAE Results, Form 137, or NAT Results — as PDF or photo (max 10 MB)</span>
        </div>
        <div className="space-y-3">
          {([1, 2, 3] as const).map(i => (
            <FileSlot key={i} index={i} file={slots[i].file} docType={slots[i].docType}
              excludeTypes={getExcluded(i)} onFileChange={(f) => handleFileChange(i, f)}
              onTypeChange={(t) => handleTypeChange(i, t)} processingState={slots[i].processingState} />
          ))}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript, commit**

  ```bash
  bun run build 2>&1 | grep "error TS" | head -5
  git add src/components/input/document-upload-panel.tsx
  git commit -m "feat(module2): add DocumentUploadPanel component"
  ```

---

## Task 12: SessionNotesForm + EditableFieldForm Components

**Files:**
- Create: `src/components/input/session-notes-form.tsx`
- Create: `src/components/input/editable-field-form.tsx`

- [ ] **Step 1: Create `src/components/input/session-notes-form.tsx`**

  ```tsx
  "use client";

  import { Target, Heart, Wallet, Flag, MessageSquare } from "lucide-react";
  import WysiwygField from "./wysiwyg-field";
  import type { ExtractedNotes } from "@/lib/analysis-types";

  const FIELDS = [
    { key: "careerGoal" as const, label: "Career Goal", icon: Target, iconBg: "#dcfce7", iconFg: "#166534", labelColor: "#166534", ph: "Start typing the student's career goal here…" },
    { key: "interests" as const, label: "Personal Interests & Strengths", icon: Heart, iconBg: "#fef08a", iconFg: "#854d0e", labelColor: "#b45309", ph: "Describe the student's interests and natural strengths…" },
    { key: "financial" as const, label: "Family & Financial Situation", icon: Wallet, iconBg: "#ecfccb", iconFg: "#3f6212", labelColor: "#3f6212", ph: "Note the family support situation and any financial constraints…" },
    { key: "concerns" as const, label: "Concerns & Red Flags", icon: Flag, iconBg: "#fee2e2", iconFg: "#991b1b", labelColor: "#b91c1c", ph: "Flag any mismatches or concerns you observed…" },
    { key: "impression" as const, label: "Counselor's Overall Impression", icon: MessageSquare, iconBg: "#d1fae5", iconFg: "#065f46", labelColor: "#065f46", ph: "Write your overall impression of the student…" },
  ] as const;

  interface SessionNotesFormProps { value: ExtractedNotes; onChange: (v: ExtractedNotes) => void; }

  export default function SessionNotesForm({ value, onChange }: SessionNotesFormProps) {
    return (
      <div className="overflow-hidden rounded-2xl border border-black/[0.06]">
        {FIELDS.map(f => (
          <WysiwygField key={f.key} label={f.label} icon={<f.icon size={12} />}
            iconBg={f.iconBg} iconFg={f.iconFg} labelColor={f.labelColor} placeholder={f.ph}
            htmlValue={value[f.key]} onChange={(html) => onChange({ ...value, [f.key]: html })} />
        ))}
      </div>
    );
  }

  export { FIELDS as SESSION_NOTE_FIELDS };
  ```

- [ ] **Step 2: Create `src/components/input/editable-field-form.tsx`**

  ```tsx
  "use client";

  import { PenLine } from "lucide-react";
  import SessionNotesForm from "./session-notes-form";
  import type { ExtractedNotes } from "@/lib/analysis-types";

  interface EditableFieldFormProps { value: ExtractedNotes; onChange: (v: ExtractedNotes) => void; }

  export default function EditableFieldForm({ value, onChange }: EditableFieldFormProps) {
    return (
      <div className="overflow-hidden rounded-2xl border border-black/[0.06] animate-fade-in">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-black/[0.015] border-black/[0.06] text-charcoal-2 text-[13px] font-semibold">
          <PenLine size={16} className="text-sage" />
          Session Notes — Edit Below
          <span className="ml-auto text-[11px] font-medium text-muted-text">All five fields required</span>
        </div>
        <SessionNotesForm value={value} onChange={onChange} />
      </div>
    );
  }
  ```

- [ ] **Step 3: Verify TypeScript, commit**

  ```bash
  bun run build 2>&1 | grep "error TS" | head -5
  git add src/components/input/session-notes-form.tsx src/components/input/editable-field-form.tsx
  git commit -m "feat(module2): add SessionNotesForm and EditableFieldForm components"
  ```

---

## Task 13: ExtractionResultsPanel Component

**Files:**
- Create: `src/components/input/extraction-results-panel.tsx`

SDD-named component. Per SRS 2.2 step 5, allows field-level editing (deviation #5). Accepts `UploadedDocument[]` rather than the legacy slot-based props.

- [ ] **Step 1: Create `src/components/input/extraction-results-panel.tsx`**

  The implementation mirrors the existing `ExtractionConfirmationPanel` but typed to `UploadedDocument` and named per SDD. Content is identical in behavior to the existing component.

  ```tsx
  "use client";

  import { useState, useCallback } from "react";
  import { Check, Edit3, ShieldCheck, Eye, X, GraduationCap, BookOpen, BarChart3 } from "lucide-react";
  import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
  import type { ExtractedAcademicData, NCAEData, NATData, Form137Data, UploadedDocument } from "@/types";

  const DOC_META: Record<string, { label: string; icon: typeof BarChart3; color: string }> = {
    ncae: { label: "NCAE Result", icon: BarChart3, color: "#3D6B3D" },
    form_137: { label: "Form 137", icon: GraduationCap, color: "#8B6914" },
    nat: { label: "NAT Result", icon: BookOpen, color: "#1E40AF" },
  };

  interface ExtractionResultsPanelProps {
    documents: UploadedDocument[];
    onDataUpdate: (slotIndex: number, data: ExtractedAcademicData) => void;
  }

  export default function ExtractionResultsPanel({ documents, onDataUpdate }: ExtractionResultsPanelProps) {
    if (documents.length === 0) return null;
    return (
      <div className="overflow-hidden rounded-2xl border border-black/[0.06] animate-fade-in">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-sage/[0.04] border-sage/20 text-charcoal-2 text-[13px] font-semibold">
          <ShieldCheck size={16} className="text-sage" />
          Extracted Data — Review &amp; Confirm
          <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-text">
            <Check size={14} className="text-sage" />
            {documents.length} document{documents.length > 1 ? "s" : ""} extracted · PII redacted
          </span>
        </div>
        {documents.length === 1 ? (
          <DocEditor doc={documents[0]} onDataUpdate={onDataUpdate} />
        ) : (
          <Tabs defaultValue={`slot-${documents[0].slotIndex}`} className="gap-0">
            <TabsList className="w-full h-auto p-1 rounded-none border-b border-black/[0.06] bg-black/[0.015]">
              {documents.map(d => {
                const meta = DOC_META[d.docType]; const Icon = meta?.icon ?? BarChart3;
                return (
                  <TabsTrigger key={d.slotIndex} value={`slot-${d.slotIndex}`}
                    className="flex-1 gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-sage data-[state=inactive]:text-muted-text">
                    <Icon size={14} /> {meta?.label ?? d.docType}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {documents.map(d => (
              <TabsContent key={d.slotIndex} value={`slot-${d.slotIndex}`} className="mt-0">
                <DocEditor doc={d} onDataUpdate={onDataUpdate} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    );
  }

  function DocEditor({ doc, onDataUpdate }: { doc: UploadedDocument; onDataUpdate: (i: number, d: ExtractedAcademicData) => void }) {
    const [showRedacted, setShowRedacted] = useState(false);
    const { extractedData, redactedImageUrl, slotIndex } = doc;
    return (
      <div className="p-4 space-y-4">
        {redactedImageUrl && (
          <div className="flex items-center gap-2 rounded-lg bg-sage/[0.06] border border-sage/15 px-3 py-2 text-[12px] text-sage">
            <ShieldCheck size={14} className="shrink-0" />
            <span className="font-medium">PII redacted server-side</span>
            <button type="button" onClick={() => setShowRedacted(s => !s)}
              className="ml-auto flex items-center gap-1 text-[11px] font-medium text-sage hover:text-sage/80 cursor-pointer">
              <Eye size={12} /> {showRedacted ? "Hide" : "View"} redacted image
            </button>
          </div>
        )}
        {showRedacted && redactedImageUrl && (
          <div className="relative rounded-lg border border-black/[0.06] overflow-hidden">
            <button type="button" onClick={() => setShowRedacted(false)}
              className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 z-10 cursor-pointer">
              <X size={12} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={redactedImageUrl} alt="Redacted document" className="w-full max-h-[400px] object-contain bg-black/[0.02]" />
          </div>
        )}
        {extractedData.type === "ncae" && <NCAEEditor data={extractedData.data} onChange={d => onDataUpdate(slotIndex, { type: "ncae", data: d })} />}
        {extractedData.type === "nat" && <NATEditor data={extractedData.data} onChange={d => onDataUpdate(slotIndex, { type: "nat", data: d })} />}
        {extractedData.type === "form_137" && <Form137Editor data={extractedData.data} onChange={d => onDataUpdate(slotIndex, { type: "form_137", data: d })} />}
      </div>
    );
  }

  function NCAEEditor({ data, onChange }: { data: NCAEData; onChange: (d: NCAEData) => void }) {
    const [editing, setEditing] = useState<string | null>(null);
    const update = useCallback((strand: string, v: number) => onChange({ ...data, strand_scores: { ...data.strand_scores, [strand]: v } }), [data, onChange]);
    return (
      <div className="space-y-3">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-3">NCAE Strand Scores</h4>
        <div className="grid gap-2">
          {Object.entries(data.strand_scores).map(([strand, score]) => (
            <div key={strand} className="flex items-center gap-3 rounded-lg bg-black/[0.015] p-2.5">
              <span className="flex-1 text-[13px] text-charcoal-2 font-medium">{strand}</span>
              {editing === strand ? (
                <input type="number" min={0} max={100} value={score} autoFocus
                  onChange={e => update(strand, parseFloat(e.target.value) || 0)}
                  onBlur={() => setEditing(null)} onKeyDown={e => e.key === "Enter" && setEditing(null)}
                  className="w-16 rounded border border-sage px-2 py-1 text-[13px] text-right outline-none focus:ring-1 focus:ring-sage" />
              ) : (
                <button type="button" onClick={() => setEditing(strand)}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-semibold text-sage hover:bg-sage/10 cursor-pointer">
                  {score}% <Edit3 size={11} className="text-muted-text" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function NATEditor({ data, onChange }: { data: NATData; onChange: (d: NATData) => void }) {
    const [editing, setEditing] = useState<string | null>(null);
    const update = useCallback((sub: string, v: number) => onChange({ ...data, subjects: { ...data.subjects, [sub]: v } }), [data, onChange]);
    return (
      <div className="space-y-3">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-3">NAT Subject Scores</h4>
        <div className="grid gap-2">
          {Object.entries(data.subjects).map(([sub, score]) => (
            <div key={sub} className="flex items-center gap-3 rounded-lg bg-black/[0.015] p-2.5">
              <span className="flex-1 text-[13px] text-charcoal-2 font-medium">{sub}</span>
              {editing === sub ? (
                <input type="number" min={0} max={100} value={score} autoFocus
                  onChange={e => update(sub, parseFloat(e.target.value) || 0)}
                  onBlur={() => setEditing(null)} onKeyDown={e => e.key === "Enter" && setEditing(null)}
                  className="w-16 rounded border border-sage px-2 py-1 text-[13px] text-right outline-none focus:ring-1 focus:ring-sage" />
              ) : (
                <button type="button" onClick={() => setEditing(sub)}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-semibold text-sage hover:bg-sage/10 cursor-pointer">
                  {score} <Edit3 size={11} className="text-muted-text" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function Form137Editor({ data, onChange }: { data: Form137Data; onChange: (d: Form137Data) => void }) {
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const updateGrade = useCallback((idx: number, v: number) => {
      const updated = [...data.subjects]; updated[idx] = { ...updated[idx], grade: v };
      onChange({ ...data, subjects: updated });
    }, [data, onChange]);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-3">Subject Grades</h4>
          {data.school_year && <span className="text-[11px] text-muted-text">S.Y. {data.school_year}</span>}
        </div>
        <div className="rounded-lg border border-black/[0.06] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-black/[0.06] bg-black/[0.015]">
              <th className="px-3 py-2 text-left font-semibold text-charcoal-3 text-[11px] uppercase tracking-wider">Subject</th>
              <th className="px-3 py-2 text-right font-semibold text-charcoal-3 text-[11px] uppercase tracking-wider w-20">Grade</th>
            </tr></thead>
            <tbody>
              {data.subjects.map((s, i) => (
                <tr key={i} className="border-b border-black/[0.04] last:border-b-0 hover:bg-black/[0.01]">
                  <td className="px-3 py-2 text-charcoal-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-right">
                    {editingIdx === i ? (
                      <input type="number" min={60} max={100} value={s.grade} autoFocus
                        onChange={e => updateGrade(i, parseFloat(e.target.value) || 0)}
                        onBlur={() => setEditingIdx(null)} onKeyDown={e => e.key === "Enter" && setEditingIdx(null)}
                        className="w-16 rounded border border-sage px-2 py-1 text-[13px] text-right outline-none focus:ring-1 focus:ring-sage" />
                    ) : (
                      <button type="button" onClick={() => setEditingIdx(i)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-semibold text-sage hover:bg-sage/10 cursor-pointer">
                        {s.grade} <Edit3 size={10} className="text-muted-text" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript, commit**

  ```bash
  bun run build 2>&1 | grep "error TS" | head -5
  git add src/components/input/extraction-results-panel.tsx
  git commit -m "feat(module2): add ExtractionResultsPanel component"
  ```

---

## Task 14: ConfirmationApprovalBar Component

**Files:**
- Create: `src/components/input/confirmation-approval-bar.tsx`

Per SDD: button disabled until all 5 notes fields have text. Documents are optional.

- [ ] **Step 1: Create `src/components/input/confirmation-approval-bar.tsx`**

  ```tsx
  "use client";

  import { Sparkles, Loader2 } from "lucide-react";
  import type { ExtractedNotes } from "@/lib/analysis-types";

  function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  function allFieldsFilled(notes: ExtractedNotes): boolean {
    return (
      stripHtml(notes.careerGoal).length > 0 &&
      stripHtml(notes.interests).length > 0 &&
      stripHtml(notes.financial).length > 0 &&
      stripHtml(notes.concerns).length > 0 &&
      stripHtml(notes.impression).length > 0
    );
  }

  interface ConfirmationApprovalBarProps {
    notes: ExtractedNotes;
    sessionId: string;
    isSubmitting: boolean;
    onApprove: () => void;
  }

  export default function ConfirmationApprovalBar({ notes, sessionId: _sessionId, isSubmitting, onApprove }: ConfirmationApprovalBarProps) {
    const canApprove = allFieldsFilled(notes) && !isSubmitting;
    return (
      <div className="px-6 pb-6 sm:px-8 sm:pb-8">
        <button type="button" disabled={!canApprove} onClick={onApprove}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-charcoal py-4 text-[15px] font-semibold text-white transition-colors hover:bg-sage disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
          {isSubmitting
            ? <Loader2 size={18} className="animate-spin" />
            : <Sparkles size={18} className={canApprove ? "animate-pulse group-hover:animate-spin" : ""} />}
          {isSubmitting ? "Preparing analysis…" : "Begin Multi Agent Analysis"}
        </button>
        <p className="mt-3 text-center text-xs font-medium text-muted-text">
          {!allFieldsFilled(notes)
            ? "Fill in all five session note fields to enable analysis"
            : <span className="text-sage">All inputs ready. Click above to begin the analysis.</span>}
        </p>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript, commit**

  ```bash
  bun run build 2>&1 | grep "error TS" | head -5
  git add src/components/input/confirmation-approval-bar.tsx
  git commit -m "feat(module2): add ConfirmationApprovalBar component"
  ```

---

## Task 15: Wire input-container.tsx to Session-Based Backend

**Files:**
- Modify: `src/components/input/input-container.tsx`

Replace with a version that uses all SDD-named components, creates a session on mount, uploads through the new route, and approves via the approve route with correction diffs.

- [ ] **Step 1: Replace `src/components/input/input-container.tsx`**

  The full replacement is shown below. Key differences from current:
  - Session created via `POST /api/sessions` on mount
  - `DocumentUploadPanel` used for file uploads
  - `ExtractionResultsPanel` used for extracted data display
  - `EditableFieldForm` used for notes in manual tab
  - `ConfirmationApprovalBar` used for the approve button
  - Approve calls `POST /api/sessions/[sessionId]/approve` with correction diffs
  - `canAnalyze` logic: **all 5 fields required** (per SDD) rather than any 1 field

  ```tsx
  "use client";

  import { useState, useCallback, useEffect } from "react";
  import { useRouter } from "next/navigation";
  import {
    FileText, Target, Heart, Wallet, Flag, MessageSquare,
    ChevronDown, Download, Image as ImageIcon, Loader2,
    AlertTriangle, X, ScanText, Check, Info, PenLine,
  } from "lucide-react";
  import WysiwygField from "./wysiwyg-field";
  import DocumentUploadPanel from "./document-upload-panel";
  import ExtractionResultsPanel from "./extraction-results-panel";
  import EditableFieldForm from "./editable-field-form";
  import ConfirmationApprovalBar from "./confirmation-approval-bar";
  import { toast } from "sonner";
  import { EMPTY_NOTES } from "@/lib/analysis-types";
  import type { ExtractedNotes } from "@/lib/analysis-types";
  import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
  import inputStyles from "@/styles/input.module.css";
  import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
  } from "@/components/ui/alert-dialog";
  import type { DocumentProcessingState, ExtractedAcademicData, UploadedDocument, CorrectionLog } from "@/types";

  const GUIDE = [
    { icon: Target, title: "Section 1 — Career Goal", bullets: ["What course or career does the student want to pursue?", "Why do they want this? Write their exact words.", "How certain are they?", "Do they have a backup plan?"] },
    { icon: Heart, title: "Section 2 — Personal Interests & Strengths", bullets: ["Subjects or activities they enjoy the most", "What they are naturally good at", "Topics that made them visibly excited during the interview"] },
    { icon: Wallet, title: "Section 3 — Family & Financial Situation", bullets: ["Can the family support the preferred course?", "Is there family pressure toward a specific career?", "Any financial or logistical barriers?"] },
    { icon: Flag, title: "Section 4 — Concerns & Red Flags", bullets: ["Any mismatch between stated goal and observed strengths", "Does the student understand what the career involves day-to-day?", "Signs external pressure is overriding genuine interest"] },
    { icon: MessageSquare, title: "Section 5 — Counselor's Overall Impression", bullets: ["Free-form narrative — gut feel, confidence in their goals", "Anything not captured in sections above", "Recommended focus areas for AI analysis"] },
  ];

  type InputMode = "image" | "manual";

  const SECTIONS_CONFIG = [
    { key: "careerGoal" as const, label: "Career Goal", icon: Target, iconBg: "#dcfce7", iconFg: "#166534", labelColor: "#166534", ph: "Start typing the student's career goal here…" },
    { key: "interests" as const, label: "Personal Interests & Strengths", icon: Heart, iconBg: "#fef08a", iconFg: "#854d0e", labelColor: "#b45309", ph: "Describe the student's interests and natural strengths…" },
    { key: "financial" as const, label: "Family & Financial Situation", icon: Wallet, iconBg: "#ecfccb", iconFg: "#3f6212", labelColor: "#3f6212", ph: "Note the family support situation and any financial constraints…" },
    { key: "concerns" as const, label: "Concerns & Red Flags", icon: Flag, iconBg: "#fee2e2", iconFg: "#991b1b", labelColor: "#b91c1c", ph: "Flag any mismatches or concerns you observed…" },
    { key: "impression" as const, label: "Counselor's Overall Impression", icon: MessageSquare, iconBg: "#d1fae5", iconFg: "#065f46", labelColor: "#065f46", ph: "Write your overall impression of the student…" },
  ] as const;

  const IDLE_PROC: DocumentProcessingState = { step: "idle", progress: 0 };

  export default function InputContainer() {
    const router = useRouter();

    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionError, setSessionError] = useState<string | null>(null);
    const [guideOpen, setGuideOpen] = useState(false);

    const [slotFiles, setSlotFiles] = useState<{ 1: File | null; 2: File | null; 3: File | null }>({ 1: null, 2: null, 3: null });
    const [slotTypes, setSlotTypes] = useState<{ 1: string; 2: string; 3: string }>({ 1: "", 2: "", 3: "" });
    const [slotProcessing, setSlotProcessing] = useState<{ 1: DocumentProcessingState; 2: DocumentProcessingState; 3: DocumentProcessingState }>({ 1: { ...IDLE_PROC }, 2: { ...IDLE_PROC }, 3: { ...IDLE_PROC } });
    const [uploadedDocs, setUploadedDocs] = useState<UploadedDocument[]>([]);

    const [activeTab, setActiveTab] = useState<InputMode>("image");
    const [pendingTab, setPendingTab] = useState<InputMode | null>(null);
    const [showSwitchDialog, setShowSwitchDialog] = useState(false);
    const [notesFile, setNotesFile] = useState<File | null>(null);
    const [drag, setDrag] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [imageSectionsReady, setImageSectionsReady] = useState(false);
    const [imageSectionHtml, setImageSectionHtml] = useState<ExtractedNotes>(EMPTY_NOTES);
    const [manualSectionHtml, setManualSectionHtml] = useState<ExtractedNotes>(EMPTY_NOTES);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const sectionHtml = activeTab === "image" ? imageSectionHtml : manualSectionHtml;

    useEffect(() => {
      fetch("/api/sessions", { method: "POST" })
        .then(r => r.json())
        .then(d => setSessionId(d.sessionId))
        .catch(() => setSessionError("Could not start session. Please refresh the page."));
    }, []);

    const tabHasData = (tab: InputMode) => {
      if (tab === "image") return !!(notesFile || Object.values(imageSectionHtml).some(v => v.trim() !== ""));
      return Object.values(manualSectionHtml).some(v => v.trim() !== "");
    };

    const handleTabChange = (newTab: string) => {
      const target = newTab as InputMode;
      if (target === activeTab) return;
      if (tabHasData(activeTab)) { setPendingTab(target); setShowSwitchDialog(true); }
      else setActiveTab(target);
    };

    const confirmTabSwitch = () => {
      if (!pendingTab) return;
      if (activeTab === "image") resetImageState();
      else setManualSectionHtml(EMPTY_NOTES);
      setActiveTab(pendingTab); setPendingTab(null); setShowSwitchDialog(false);
    };

    const resetImageState = () => {
      setNotesFile(null); setScanning(false); setScanError(null);
      setImageSectionsReady(false); setImageSectionHtml(EMPTY_NOTES);
    };

    const extractSections = async (file: File) => {
      setScanning(true); setScanError(null); setImageSectionsReady(false);
      try {
        const fd = new FormData(); fd.append("file", file);
        const res = await fetch("/api/extract-notes", { method: "POST", body: fd });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to extract notes"); }
        const data = await res.json();
        setImageSectionHtml({ careerGoal: data.careerGoal || "<p></p>", interests: data.interests || "<p></p>", financial: data.financial || "<p></p>", concerns: data.concerns || "<p></p>", impression: data.impression || "<p></p>" });
        setImageSectionsReady(true);
        toast.success("Notes extracted", { description: "AI Vision extracted your counselor notes", position: "top-center" });
      } catch (err) {
        setScanError(err instanceof Error ? err.message : "Extraction failed");
      } finally {
        setScanning(false);
      }
    };

    const handleNotesSelect = (f: File | null) => {
      if (!f) { resetImageState(); return; }
      if (!f.type.startsWith("image/")) { toast.error("Invalid file type", { position: "top-center" }); return; }
      setNotesFile(f); extractSections(f);
    };

    const handleSlotFileChange = useCallback((index: 1 | 2 | 3, file: File | null) => {
      setSlotFiles(p => ({ ...p, [index]: file }));
      if (!file) {
        setSlotProcessing(p => ({ ...p, [index]: IDLE_PROC }));
        setUploadedDocs(d => d.filter(u => u.slotIndex !== index));
      } else {
        setSlotProcessing(p => ({ ...p, [index]: { step: "ai_structuring", progress: 30 } }));
      }
    }, []);

    const handleSlotTypeChange = useCallback((index: 1 | 2 | 3, type: string) => {
      setSlotTypes(p => ({ ...p, [index]: type }));
    }, []);

    const handleDocumentUploaded = useCallback((index: 1 | 2 | 3, result: UploadedDocument) => {
      setSlotProcessing(p => ({ ...p, [index]: { step: "complete", progress: 100, extractedData: result.extractedData } }));
      setUploadedDocs(d => [...d.filter(u => u.slotIndex !== index), result]);
      toast.success(`Document ${index} extracted`, { description: "PII redacted server-side", position: "top-center" });
    }, []);

    const handleUploadError = useCallback((index: 1 | 2 | 3, error: string) => {
      setSlotProcessing(p => ({ ...p, [index]: { step: "error", progress: 0, error } }));
      toast.error(`Document ${index} failed`, { description: error, position: "top-center" });
    }, []);

    const handleDataUpdate = useCallback((slotIndex: number, data: ExtractedAcademicData) => {
      setUploadedDocs(d => d.map(u => u.slotIndex === slotIndex ? { ...u, extractedData: data } : u));
    }, []);

    const handleApprove = async () => {
      if (!sessionId) return;
      setIsSubmitting(true);
      try {
        const corrections: CorrectionLog[] = [];
        for (const doc of uploadedDocs) {
          if (doc.extractedData.type === "ncae" && doc.originalExtractedData.type === "ncae") {
            for (const strand of Object.keys(doc.extractedData.data.strand_scores)) {
              const orig = doc.originalExtractedData.data.strand_scores[strand];
              const curr = doc.extractedData.data.strand_scores[strand];
              if (orig !== curr) corrections.push({ session_id: sessionId, field_name: `ncae_strand.${strand}`, extracted_value: String(orig ?? ""), corrected_value: String(curr) });
            }
          }
          if (doc.extractedData.type === "nat" && doc.originalExtractedData.type === "nat") {
            for (const sub of Object.keys(doc.extractedData.data.subjects)) {
              const orig = doc.originalExtractedData.data.subjects[sub];
              const curr = doc.extractedData.data.subjects[sub];
              if (orig !== curr) corrections.push({ session_id: sessionId, field_name: `nat_subject.${sub}`, extracted_value: String(orig ?? ""), corrected_value: String(curr) });
            }
          }
          if (doc.extractedData.type === "form_137" && doc.originalExtractedData.type === "form_137") {
            doc.extractedData.data.subjects.forEach((s, i) => {
              const origGrade = doc.originalExtractedData.type === "form_137" ? doc.originalExtractedData.data.subjects[i]?.grade : undefined;
              if (origGrade !== s.grade) corrections.push({ session_id: sessionId, field_name: `form137_subject.${s.name}`, extracted_value: String(origGrade ?? ""), corrected_value: String(s.grade) });
            });
          }
        }

        const res = await fetch(`/api/sessions/${sessionId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            counselorNotes: { careerGoal: sectionHtml.careerGoal, interests: sectionHtml.interests, financial: sectionHtml.financial, concerns: sectionHtml.concerns, impression: sectionHtml.impression },
            corrections,
          }),
        });

        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Approval failed"); }
        router.push(`/analysis?session=${sessionId}`);
      } catch (err) {
        toast.error("Failed to start analysis", { description: err instanceof Error ? err.message : "Unknown error", position: "top-center" });
      } finally {
        setIsSubmitting(false);
      }
    };

    if (sessionError) {
      return (
        <section className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <div className="flex items-center gap-3 rounded-xl bg-red-light border border-red-soft/20 p-4 text-red-soft">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="text-[14px]">{sessionError}</span>
          </div>
        </section>
      );
    }

    return (
      <section className="mx-auto w-full max-w-4xl px-4 sm:px-6 relative animate-fade-in">
        <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-cream-light shadow-card">

          {/* Part 1: Counselor Notes */}
          <div className="p-6 sm:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sage/10 text-sage"><FileText size={20} /></div>
              <div>
                <h2 className="text-base font-semibold text-ink leading-snug">
                  Counselor Notes
                  <span className="ml-2 inline-block align-middle rounded-full bg-sage px-2 py-0.5 text-[10px] font-bold uppercase text-white">Required</span>
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-text">Write your interview notes, take a clear photo, and upload it — or type them directly.</p>
              </div>
            </div>

            <div className="mb-5 rounded-xl border border-sage/20 overflow-hidden">
              <button type="button" onClick={() => setGuideOpen(!guideOpen)}
                className="flex w-full items-center justify-between px-4 py-3 bg-sage/[0.07] text-sage text-[13px] font-medium cursor-pointer hover:bg-sage/[0.12] transition-colors">
                <div className="flex items-center gap-3"><Info size={16} /><span>Notes Format Guide — What to write in each section</span></div>
                <ChevronDown size={16} className={`transition-transform duration-200 ${guideOpen ? "rotate-180" : ""}`} />
              </button>
              {guideOpen && (
                <div className="p-4 space-y-4 animate-fade-in">
                  {GUIDE.map(g => (
                    <div key={g.title} className="flex gap-3">
                      <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-sage/10 text-sage"><g.icon size={14} /></div>
                      <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-charcoal-3 mb-1">{g.title}</h4>
                        <ul className="list-disc pl-4 text-[13px] text-charcoal-3 leading-relaxed">{g.bullets.map(b => <li key={b}>{b}</li>)}</ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl bg-cream-dark/60 p-4 mb-6">
              <div><h3 className="text-sm font-semibold text-ink">Download &amp; Print the Notes Form</h3><p className="text-xs text-muted-text">Pre-structured form you can fill out by hand during the session</p></div>
              <a href="/kumpas_career_interview_notes.pdf" download className="inline-flex items-center gap-1.5 rounded-lg bg-sage px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-sage/80 whitespace-nowrap">
                <Download size={16} /> Download PDF
              </a>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-0">
              <TabsList className="w-full h-auto p-1 rounded-xl bg-cream-dark/80 border border-black/[0.06] mb-4">
                <TabsTrigger value="image" className="flex-1 gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-sage data-[state=active]:shadow-sm data-[state=inactive]:text-muted-text">
                  <ImageIcon size={15} /> Image Analysis
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex-1 gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-sage data-[state=active]:shadow-sm data-[state=inactive]:text-muted-text">
                  <PenLine size={15} /> Manual Input
                </TabsTrigger>
              </TabsList>

              <TabsContent value="image" className="mt-0">
                {!notesFile ? (
                  <div className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-all animate-fade-in ${drag ? "border-sage bg-sage/[0.04]" : "border-black/10 bg-cream/40 hover:border-black/20"}`}
                    onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                    onDrop={e => { e.preventDefault(); setDrag(false); handleNotesSelect(e.dataTransfer.files?.[0] || null); }}
                    onClick={() => document.getElementById("notes-file-input")?.click()}>
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm text-sage"><ImageIcon size={24} /></div>
                    <p className="text-[15px] font-semibold text-ink">Upload photo of your notes</p>
                    <p className="mt-1 text-[13px] text-muted-text"><span className="text-sage font-medium">Tap to choose</span> or drag &amp; drop an image here</p>
                    <input id="notes-file-input" type="file" accept="image/*" className="hidden" onChange={e => handleNotesSelect(e.target.files?.[0] || null)} />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 rounded-xl border border-sage/20 bg-sage/[0.04] p-3 animate-fade-in">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${scanning ? "bg-amber" : scanError ? "bg-red-soft" : "bg-sage"}`}>
                        {scanning ? <Loader2 size={20} className="animate-spin" /> : scanError ? <AlertTriangle size={20} /> : <ImageIcon size={20} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[13px] font-semibold text-ink">{notesFile.name}</p>
                        <p className={`text-[11px] ${scanError ? "text-red-soft" : "text-muted-text"}`}>{scanning ? "Reading handwriting with AI Vision…" : scanError ? scanError : `${(notesFile.size / 1024).toFixed(0)} KB · Extracted & ready to edit`}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${scanning ? "bg-amber/15 text-amber" : scanError ? "bg-red-soft/15 text-red-soft" : "bg-white border border-sage/20 text-sage"}`}>
                        {scanning ? "Scanning" : scanError ? "Error" : <><Check size={12} /> Scanned</>}
                      </span>
                      <button type="button" onClick={resetImageState} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white text-black/30 hover:text-charcoal-2 cursor-pointer"><X size={14} /></button>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-black/[0.06] animate-fade-in">
                      <div className={`flex items-center gap-2.5 px-4 py-3 border-b text-[13px] font-semibold ${scanError ? "bg-red-light border-red-soft/30 text-red-soft" : "bg-black/[0.015] border-black/[0.06] text-charcoal-2"}`}>
                        <ScanText size={16} className={scanning ? "text-amber" : scanError ? "text-red-soft" : "text-sage"} />
                        {scanning ? "Extracting your notes…" : scanError ? "Extraction failed" : "Extracted Notes — Edit Below"}
                        {!scanning && !scanError && <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-text"><Check size={14} className="text-sage" /> AI-extracted · editable</span>}
                      </div>
                      {scanning && (
                        <div className="p-4 space-y-6">
                          {[37, 50, 42, 58, 65].map((w, i) => (
                            <div key={i} className="space-y-2">
                              <div className={`h-3.5 rounded ${inputStyles.shimmer}`} style={{ width: `${w}%` }} />
                              <div className={`rounded ${inputStyles.shimmer}`} style={{ height: `${74 + i * 4}px` }} />
                            </div>
                          ))}
                        </div>
                      )}
                      {scanError && (
                        <div className="flex items-start gap-3 p-4 bg-red-light text-red-soft text-[13px] leading-snug">
                          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                          Could not read the notes. Please ensure the image is clear and well-lit, then try again.
                        </div>
                      )}
                      {imageSectionsReady && SECTIONS_CONFIG.map(s => (
                        <WysiwygField key={s.key} label={s.label} icon={<s.icon size={12} />} iconBg={s.iconBg} iconFg={s.iconFg} labelColor={s.labelColor} placeholder={s.ph}
                          htmlValue={imageSectionHtml[s.key]} onChange={h => setImageSectionHtml(prev => ({ ...prev, [s.key]: h }))} />
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="manual" className="mt-0">
                <EditableFieldForm value={manualSectionHtml} onChange={setManualSectionHtml} />
              </TabsContent>
            </Tabs>
          </div>

          <hr className="border-t border-black/[0.06]" />

          {/* Part 2: DocumentUploadPanel */}
          {sessionId ? (
            <DocumentUploadPanel
              sessionId={sessionId}
              slots={{ 1: { file: slotFiles[1], docType: slotTypes[1], processingState: slotProcessing[1] }, 2: { file: slotFiles[2], docType: slotTypes[2], processingState: slotProcessing[2] }, 3: { file: slotFiles[3], docType: slotTypes[3], processingState: slotProcessing[3] } }}
              onSlotFileChange={handleSlotFileChange}
              onSlotTypeChange={handleSlotTypeChange}
              onDocumentUploaded={handleDocumentUploaded}
              onUploadError={handleUploadError}
            />
          ) : (
            <div className="p-6 sm:p-8 flex items-center gap-2 text-muted-text text-[13px]">
              <Loader2 size={16} className="animate-spin" /> Initializing session…
            </div>
          )}

          {/* Part 2.5: ExtractionResultsPanel */}
          {uploadedDocs.length > 0 && (
            <div className="px-6 sm:px-8 pb-4">
              <ExtractionResultsPanel documents={uploadedDocs} onDataUpdate={handleDataUpdate} />
            </div>
          )}

          {/* Part 3: ConfirmationApprovalBar */}
          {sessionId && (
            <ConfirmationApprovalBar notes={sectionHtml} sessionId={sessionId} isSubmitting={isSubmitting} onApprove={handleApprove} />
          )}
        </div>

        <AlertDialog open={showSwitchDialog} onOpenChange={setShowSwitchDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Switch input method?</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved notes in the <strong>{activeTab === "image" ? "Image Analysis" : "Manual Input"}</strong> tab. Switching will discard your current input.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setPendingTab(null); setShowSwitchDialog(false); }}>Stay here</AlertDialogCancel>
              <AlertDialogAction onClick={confirmTabSwitch} className="bg-red-600 text-white hover:bg-red-700">Discard &amp; switch</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    );
  }
  ```

- [ ] **Step 2: TypeScript build check**

  ```bash
  bun run build 2>&1 | grep -E "error TS|Failed" | head -30
  ```

  Fix any type errors before proceeding.

- [ ] **Step 3: Manual browser verification**

  Run `bun run dev`, open `http://localhost:3000/input`:
  1. Page loads → "Initializing session…" briefly visible → session created (check Supabase sessions table)
  2. Manual Input tab → fill all 5 fields → "Begin Multi Agent Analysis" button enables
  3. Manual Input tab → leave one field empty → button stays disabled
  4. Upload a document with type → loading state shows → completion state with "PII redacted server-side"
  5. Click "Begin Multi Agent Analysis" with all 5 fields filled → navigates to `/analysis?session=<id>`
  6. Check Supabase: `SELECT id, status, approved_profile IS NOT NULL FROM public.sessions ORDER BY created_at DESC LIMIT 5;`

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/input/input-container.tsx
  git commit -m "feat(module2): wire input-container to session-based backend with all SDD-named components"
  ```

---

## Spec Coverage Summary

| Component | File | Status |
|---|---|---|
| DocumentUploadPanel | `document-upload-panel.tsx` | ✅ |
| SessionNotesForm | `session-notes-form.tsx` | ✅ |
| UploadStatusIndicator | `upload-status-indicator.tsx` | ✅ (sync, not SSE — deviation 2) |
| FileUploadController | `api/sessions/[sessionId]/upload/route.ts` | ✅ |
| PIIRedactionService | `lib/module2/pii-redaction-service.ts` | ✅ (sync — deviation 1) |
| DocumentStorageService | `lib/module2/document-storage-service.ts` | ✅ (in-memory raw — deviation 3) |
| SessionInitializationService | `lib/module2/session-initialization-service.ts` | ✅ |
| ExtractionResultsPanel | `extraction-results-panel.tsx` | ✅ (editable per SRS — deviation 5) |
| EditableFieldForm | `editable-field-form.tsx` | ✅ |
| ConfirmationApprovalBar | `confirmation-approval-bar.tsx` | ✅ |
| GeminiExtractionService | `lib/module2/gemini-extraction-service.ts` | ✅ |
| StudentProfileBuilder | `lib/module2/student-profile-builder.ts` | ✅ |
| sessions table | migration | ✅ |
| session_notes table | migration | ✅ |
| extraction_results table | migration | ✅ |
| correction_logs table | migration | ✅ |
| kumpas-documents bucket | migration | ✅ |

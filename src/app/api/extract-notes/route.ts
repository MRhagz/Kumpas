import { ProviderError } from "@/lib/processing-budget";
/**
 * API route: Gemini Vision — extract counselor notes from image.
 *
 * POST /api/extract-notes
 * Body: FormData with `file` (image)
 *
 * Uses the configured Gemini image endpoint for reading
 * handwritten/typed counselor notes and structuring into 5 sections.
 * SW-05 waives local masking; results always require counselor review.
 */

import { type NextRequest } from "next/server";
import { requireUser, unauthorizedResponse, userOwnsSession, notFoundResponse } from "@/lib/auth/api-auth";

import { getGeminiResponseText, requestGeminiImageJson } from "@/lib/module3/gemini-config";

import { readBoundedForm, validateAcademicContent, UploadValidationError, uploadErrorResponse } from "@/lib/module2/academic-upload-validation";
import { academicFileSizeError } from "@/lib/academic-upload-policy";
import { draftHeaders, intakeRpc, readIntakeDraft } from "@/lib/module2/intake-draft-store";
import { EXTRACTION_PROMPT_VERSION, normalizeNotes, NOTE_KEYS } from "@/lib/module2/extraction-contract";
import { getGeminiGenerationModel } from "@/lib/module3/gemini-config";
import { randomUUID } from "node:crypto";
import { claimTemporaryUpload, downloadTemporaryUpload, cleanupTemporaryUpload, readUploadJson, type TemporaryIntakeUpload } from "@/lib/module2/temporary-intake-upload";

export const runtime = "nodejs";
export const maxDuration = 300;

const PROMPT = `You are a career counselor's assistant. You are given an image of handwritten or typed interview notes taken during a career counseling session with a student.

Carefully read the image and extract the information. Restructure it into the following JSON format:
{
  "careerGoal": "<html formatted text>",
  "interests": "<html formatted text>",
  "financial": "<html formatted text>",
  "concerns": "<html formatted text>",
  "impression": "<html formatted text>"
}

Section mapping:
- careerGoal: What course or career does the student want to pursue? Why? How certain are they? Backup plans?
- interests: Subjects, activities, natural strengths, topics they enjoyed or got excited about.
- financial: Family support, financial constraints, family pressure toward a specific career.
- concerns: Red flags, mismatches between goals and strengths, signs of external pressure, lack of understanding of the career.
- impression: Counselor's overall gut feel, confidence in goals, recommended focus areas, anything not captured above.

Rules:
- Format the output values as clean HTML (use <p>, <ul>, <li>, <strong> where appropriate for readability).
- If a section has no relevant information in the notes, use "<p></p>".
- Do NOT include any student names, birthdates, ID numbers, school names, parent names, addresses, or any personally identifiable information in the output. Replace any such information with generic terms like "the student", "the parent", etc.
- Return ONLY the JSON object, no markdown formatting or explanation.`;

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();

  let temporary: TemporaryIntakeUpload | undefined;
  try {
    const staged = request.headers.get("content-type")?.startsWith("application/json");
    const body = staged ? await readUploadJson(request) : null;
    const formData = staged ? new FormData() : await readBoundedForm(request);
    if (body) {
      for (const name of ["sessionId", "revision", "notesReviewed"]) {
        if (body[name] !== undefined) formData.set(name, String(body[name]));
      }
    }
    if (formData.get("notesReviewed") !== "true") {
      return Response.json({ error: "Confirm that prepared notes exclude personal identifiers and confidential details" }, { status: 400 });
    }

    const sessionId = formData.get("sessionId");
    const revision = Number(formData.get("revision"));
    if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId) ||
        formData.get("revision") === null || !Number.isInteger(revision) || revision < 0) {
      return Response.json({ error: "A session and saved notes revision are required." }, { status: 400 });
    }
    if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();
    const draft = await readIntakeDraft(sessionId, user.id);
    if (draft.notes?.revision !== revision) return Response.json({ error: "Notes changed. Reload before extracting." }, { status: 409 });
    let buffer: Buffer, mimeType: string;
    if (body) {
      temporary = await claimTemporaryUpload(sessionId, user.id, body.uploadId);
      if (temporary.document_type !== "notes" || temporary.notes_revision !== revision) {
        throw new UploadValidationError("Choose the current notes photograph upload.", 400);
      }
      ({ buffer, mimeType } = await downloadTemporaryUpload(temporary));
    } else {
      const file = formData.get("file");
      if (!(file instanceof File) || formData.getAll("file").length !== 1) {
        return Response.json(
          { error: "Missing required field: file" },
          { status: 400 }
        );
      }
      const sizeError = academicFileSizeError(file);
      if (sizeError) throw new UploadValidationError(sizeError, 413);
      buffer = Buffer.from(await file.arrayBuffer());
      mimeType = await validateAcademicContent(buffer, file.type);
    }
    if (!mimeType.startsWith("image/")) throw new UploadValidationError("Upload a JPEG, PNG or WEBP notes photograph.", 415);
    const base64Data = buffer.toString("base64");

    // Call Gemini Vision API with image + text prompt
    const geminiData = await requestGeminiImageJson({
      contents: [
        {
          parts: [
            { text: PROMPT },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    });

    const rawText = getGeminiResponseText(geminiData);

    // Parse the JSON response
    let parsed: Record<string, string>;
    try {
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return Response.json(
        { error: "Failed to parse AI response as JSON" },
        { status: 422 }
      );
    }

    let notes;
    try { notes = normalizeNotes(parsed); }
    catch { return Response.json({ error: "Invalid notes extraction. Retry the photograph." }, { status: 422 }); }
    // Editors render HTML: permit formatting tags only, with no attributes or active content.
    for (const key of NOTE_KEYS) notes[key] = notes[key].replace(/<[^>]*>/g, (tag) =>
      /^<\/?(?:p|ul|ol|li|strong|b|em|i|u|br)\s*\/?>$/i.test(tag) ? tag : "");
    const source = { documentId: randomUUID(), extractedAt: new Date().toISOString(),
      model: getGeminiGenerationModel(), promptVersion: EXTRACTION_PROMPT_VERSION, page: 1 };
    const saved = await intakeRpc<{ draft_revision: number }>("save_intake_notes", {
      p_session_id: sessionId, p_counselor_id: user.id, p_expected_revision: revision,
      p_notes: notes, p_source: source, p_extracted: true,
    });
    const cleanupPending = temporary ? await cleanupTemporaryUpload(temporary) : false;
    temporary = undefined;
    return Response.json({ ...notes, revision: saved.draft_revision, source, cleanupPending }, { headers: draftHeaders });
  } catch (error) {
    const validation = uploadErrorResponse(error);
    if (validation) return validation;
    if (error instanceof ProviderError) return Response.json({ error: "Gemini API request failed" }, { status: 502 });
    console.error("[extract-notes] Request failed");
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    if (temporary) await cleanupTemporaryUpload(temporary);
  }
}

import { ProviderError } from "@/lib/processing-budget";
/**
 * API route: Gemini Vision — extract structured data from document images.
 *
 * POST /api/extract-document
 * Body: FormData with `file` (image/pdf) and `docType` (ncae | form_137 | nat)
 *
 * Uses the configured Gemini image endpoint for extraction
 * Image redaction before transmission is tracked separately in SW-05.
 */

import { type NextRequest } from "next/server";
import { requireUser, unauthorizedResponse } from "@/lib/auth/api-auth";
import { selectExtractionData } from "@/lib/module3/provider-inputs";
import { readAcademicUpload, uploadErrorResponse } from "@/lib/module2/academic-upload-validation";

import { getGeminiResponseText, requestGeminiImageJson } from "@/lib/module3/gemini-config";

/* ─── Prompt templates per document type ─── */

const PROMPTS: Record<string, string> = {
  ncae: `You are a data extraction specialist for Philippine education documents.
You are given an image of a National Career Assessment Examination (NCAE) result sheet.

Carefully read the image and extract the following information. Return it as JSON:
{
  "strand_scores": { "<strand_name>": <percentile_score>, ... },
  "overall_percentile": <number or null>,
  "recommended_strand": "<string or null>"
}

Known NCAE strands: General Scholastic Aptitude, Scientific Ability, Reading Comprehension, Mathematical Ability, Verbal Ability, Clerical Ability, Manipulative Skills, Non-Verbal Ability, Entrepreneurial Skills.

Rules:
- Only include strands you can confidently identify in the image.
- Scores should be percentile values (0-100).
- If you cannot determine a value, use null.
- Do NOT include any student names, birthdates, ID numbers, or personal information in the output.
- Return ONLY the JSON object, no markdown formatting or explanation.`,

  form_137: `You are a data extraction specialist for Philippine education documents.
You are given an image of a Form 137 (Scholastic Record / Report Card).

Carefully read the image and extract the following information. Return it as JSON:
{
  "subjects": [
    { "name": "<subject_name>", "grade": <numeric_grade>, "year": "<school_year or empty string>" },
    ...
  ],
  "gwa": <general_weighted_average or null>,
  "school_year": "<school_year or null>"
}

Rules:
- Include all subjects you can identify with their grades.
- Grades should be numeric (60-100 scale typical for Philippine schools).
- If a subject appears in multiple quarters, compute the average.
- If you cannot determine GWA, set it to null.
- Do NOT include any student names, birthdates, ID numbers, or personal information in the output.
- Return ONLY the JSON object, no markdown formatting or explanation.`,

  nat: `You are a data extraction specialist for Philippine education documents.
You are given an image of a National Achievement Test (NAT) score sheet.

Carefully read the image and extract the following information. Return it as JSON:
{
  "subjects": { "<subject_name>": <score>, ... },
  "composite_score": <number or null>,
  "mastery_level": "<string or null>"
}

Known NAT subjects: Science, Mathematics, English, Filipino, Araling Panlipunan, HeKaSi, Critical Thinking.
Mastery levels: Mastered, Closely Approximating Mastery, Moving Towards Mastery, Average, Low, Did Not Meet Expectations.

Rules:
- Only include subjects you can confidently identify.
- Scores should be numeric values.
- If you cannot determine a value, use null.
- Do NOT include any student names, birthdates, ID numbers, or personal information in the output.
- Return ONLY the JSON object, no markdown formatting or explanation.`,
};

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();

  try {
    const { buffer, mimeType, docType } = await readAcademicUpload(request);

    const promptTemplate = PROMPTS[docType];
    if (!promptTemplate) {
      return Response.json(
        { error: `Unsupported document type: ${docType}` },
        { status: 400 }
      );
    }

    // Convert file to base64 for Gemini Vision
    const base64Data = buffer.toString("base64");

    // Call Gemini Vision API with image + text prompt
    const geminiData = await requestGeminiImageJson({
      contents: [
        {
          parts: [
            { text: promptTemplate },
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
    let parsed: Record<string, unknown>;
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

    // Wrap in the typed envelope
    const result = selectExtractionData(docType, parsed);

    return Response.json(result);
  } catch (err) {
    const validation = uploadErrorResponse(err);
    if (validation) return validation;
    if (err instanceof ProviderError) return Response.json({ error: "Gemini API request failed" }, { status: 502 });
    console.error("[extract-document] Request failed");
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

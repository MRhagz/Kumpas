/**
 * API route: Gemini Vision — extract structured data from document images.
 *
 * POST /api/extract-document
 * Body: FormData with `file` (image/pdf) and `docType` (ncae | form_137 | nat)
 *
 * Sends the image directly to Gemini 2.0 Flash Vision for extraction
 * and applies PII redaction on the structured output.
 */

import { type NextRequest } from "next/server";

const GEMINI_API_KEY = process.env.DOCUMENT_INTAKE_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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
  try {
    if (!GEMINI_API_KEY) {
      return Response.json(
        { error: "DOCUMENT_INTAKE_API_KEY not configured" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const docType = formData.get("docType") as string | null;

    if (!file || !docType) {
      return Response.json(
        { error: "Missing required fields: file, docType" },
        { status: 400 }
      );
    }

    const promptTemplate = PROMPTS[docType];
    if (!promptTemplate) {
      return Response.json(
        { error: `Unsupported document type: ${docType}` },
        { status: 400 }
      );
    }

    // Convert file to base64 for Gemini Vision
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";

    // Call Gemini Vision API with image + text prompt
    const geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("[extract-document] Gemini API error:", errorText);
      return Response.json(
        { error: "Gemini API request failed", details: errorText },
        { status: 502 }
      );
    }

    const geminiData = await geminiResponse.json();
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Parse the JSON response
    let parsed: Record<string, unknown>;
    try {
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[extract-document] Failed to parse Gemini response:", rawText);
      return Response.json(
        { error: "Failed to parse AI response as JSON", raw: rawText },
        { status: 422 }
      );
    }

    // Wrap in the typed envelope
    const result = { type: docType, data: parsed };

    return Response.json(result);
  } catch (err) {
    console.error("[extract-document] Unexpected error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

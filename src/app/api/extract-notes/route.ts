/**
 * API route: Gemini Vision — extract counselor notes from image.
 *
 * POST /api/extract-notes
 * Body: FormData with `file` (image)
 *
 * Sends the image directly to Gemini 2.0 Flash Vision for reading
 * handwritten/typed counselor notes and structuring into 5 sections.
 * PII is excluded from the output via prompt instructions.
 */

import { type NextRequest } from "next/server";

const GEMINI_API_KEY = process.env.DOCUMENT_INTAKE_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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
  try {
    if (!GEMINI_API_KEY) {
      return Response.json(
        { error: "DOCUMENT_INTAKE_API_KEY not configured" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json(
        { error: "Missing required field: file" },
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
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("[extract-notes] Gemini API error:", errorText);
      return Response.json(
        { error: "Gemini API request failed", details: errorText },
        { status: 502 }
      );
    }

    const geminiData = await geminiResponse.json();
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Parse the JSON response
    let parsed: Record<string, string>;
    try {
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[extract-notes] Failed to parse Gemini response:", rawText);
      return Response.json(
        { error: "Failed to parse AI response as JSON", raw: rawText },
        { status: 422 }
      );
    }

    return Response.json(parsed);
  } catch (err) {
    console.error("[extract-notes] Unexpected error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

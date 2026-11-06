import { ProviderError } from "@/lib/processing-budget";
/**
 * API route: Gemini Vision — extract counselor notes from image.
 *
 * POST /api/extract-notes
 * Body: FormData with `file` (image)
 *
 * Uses the configured Gemini image endpoint for reading
 * handwritten/typed counselor notes and structuring into 5 sections.
 * Prompt instructions do not replace SW-05 image redaction.
 */

import { type NextRequest } from "next/server";
import { requireUser, unauthorizedResponse } from "@/lib/auth/api-auth";

import { getGeminiResponseText, requestGeminiImageJson } from "@/lib/module3/gemini-config";

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

  try {
    const formData = await request.formData();
    if (formData.get("notesReviewed") !== "true") {
      return Response.json({ error: "Confirm that prepared notes exclude personal identifiers and confidential details" }, { status: 400 });
    }

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

    return Response.json(Object.fromEntries(
      ["careerGoal", "interests", "financial", "concerns", "impression"].map(
        (key) => [key, typeof parsed?.[key] === "string" ? parsed[key] : "<p></p>"],
      ),
    ));
  } catch (error) {
    if (error instanceof ProviderError) return Response.json({ error: "Gemini API request failed" }, { status: 502 });
    console.error("[extract-notes] Request failed");
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

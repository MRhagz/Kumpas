import { supabaseAdmin } from "@/lib/supabase";
import type { ExtractedAcademicData, ExtractionResult } from "@/types";

const GEMINI_API_KEY = process.env.DOCUMENT_INTAKE_API_KEY!;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const PROMPTS: Record<string, string> = {
  ncae: `You are a data extraction specialist for Philippine NCAE result sheets. Extract and return only this JSON:
{"strand_scores":{"<strand_name>":<percentile_0_to_100>},"overall_percentile":<number|null>,"recommended_strand":"<string|null>"}
Known strands: General Scholastic Aptitude, Scientific Ability, Reading Comprehension, Mathematical Ability, Verbal Ability, Clerical Ability, Manipulative Skills, Non-Verbal Ability, Entrepreneurial Skills.
Do NOT include any names, birthdates, or IDs in the output. Return ONLY the JSON object.`,

  form_137: `You are a data extraction specialist for Philippine Form 137 documents. Extract and return only this JSON:
{"subjects":[{"name":"<subject>","grade":<number>,"year":"<string>"}],"gwa":<number|null>,"school_year":"<string|null>"}
Grades are 60-100. Average multiple quarters if present. Do NOT include any names, birthdates, or IDs in the output. Return ONLY the JSON object.`,

  nat: `You are a data extraction specialist for Philippine NAT score sheets. Extract and return only this JSON:
{"subjects":{"<subject>":<score>},"composite_score":<number|null>,"mastery_level":"<string|null>"}
Known subjects: Science, Mathematics, English, Filipino, Araling Panlipunan, HeKaSi, Critical Thinking.
Do NOT include any names, birthdates, or IDs in the output. Return ONLY the JSON object.`,
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

    const base64 = imageBuffer.toString("base64");

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: base64 } },
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

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Gemini extraction failed: ${detail}`);
    }

    const geminiData = await response.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed: Record<string, unknown>;
    try {
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Failed to parse Gemini extraction response: ${rawText.slice(0, 200)}`);
    }

    const structuredData = {
      type: docType as ExtractedAcademicData["type"],
      data: parsed,
    } as unknown as ExtractedAcademicData;

    const { data: saved, error } = await supabaseAdmin
      .from("extraction_results")
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

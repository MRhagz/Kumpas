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

  form_137: `You are a data extraction specialist for Philippine DepEd Form 137 (Permanent Record). Form 137 documents typically span multiple grade levels (e.g. Grade I–VI for elementary, or Grade VII–X for high school), each with its own school year.

Return EXACTLY ONE JSON object — never an array — with this shape, even when the document covers many grade levels:
{"subjects":[{"name":"<subject>","grade":<number>,"year":"<school_year>"}],"gwa":<number|null>,"school_year":"<string|null>"}

Rules:
- Emit ONE entry per (subject × grade level) pair across the entire document. Flatten all grade levels into the single "subjects" array. Do NOT return an array of grade levels.
- "grade" is the FINAL RATING (rightmost rating column), not a quarterly periodic rating. If only a "General Average" is shown for that grade level, skip the per-subject rows for that level.
- "year" is the school year string of that grade level (e.g. "2011-2012").
- If a learning area has named sub-components (e.g. Makabayan with HKS / EPP / MAPE / Character Educ.), list each sub-component as its own subject entry.
- Skip rows with no grade value.
- "school_year" at the top level is the MOST RECENT school year shown in the document.
- "gwa" is null unless a single overall General Weighted Average is printed at the document level; do NOT compute it.
- Grades are 60–100.
- Do NOT include any names, birthdates, LRN, addresses, or other PII.

Return ONLY the JSON object, no prose, no code fences.`,

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
          // 4096 truncates dense Form 137s (6 grade levels × ~7 subjects each) mid-stream.
          maxOutputTokens: 8192,
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

    let parsed: unknown;
    try {
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error(`[gemini-extraction-service] parse failed for ${docType}. rawText:`, rawText);
      throw new Error(`Failed to parse Gemini extraction response: ${rawText.slice(0, 200)}`);
    }

    // Defense: Form 137 occasionally comes back as an array of per-grade-level objects
    // (model misreads "multi-year" as "multi-document"). Flatten to the single-object shape.
    if (docType === "form_137" && Array.isArray(parsed)) {
      type Form137Year = { subjects?: unknown[]; school_year?: string | null; gwa?: number | null };
      const arr = parsed as Form137Year[];
      parsed = {
        subjects: arr.flatMap((p) => (Array.isArray(p?.subjects) ? p.subjects : [])),
        gwa: arr.find((p) => typeof p?.gwa === "number")?.gwa ?? null,
        school_year: arr[arr.length - 1]?.school_year ?? null,
      };
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

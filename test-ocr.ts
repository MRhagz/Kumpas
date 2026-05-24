/**
 * Test script: Gemini Vision extraction on sample test images.
 *
 * Usage:
 *   npx tsx test-ocr.ts                     # runs all test images
 *   npx tsx test-ocr.ts test/NCAE-results.png ncae
 *   npx tsx test-ocr.ts test/counselor-notes.jpg notes
 *   npx tsx test-ocr.ts test/report-card.jpg form_137
 */

import fs from "fs";
import path from "path";

const GEMINI_API_KEY = process.env.DOCUMENT_INTAKE_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

if (!GEMINI_API_KEY) {
  // Try loading from .env manually
  const envPath = path.resolve(".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    const match = envContent.match(/DOCUMENT_INTAKE_API_KEY=(.+)/);
    if (match) {
      (process.env as Record<string, string>).DOCUMENT_INTAKE_API_KEY = match[1].trim();
    }
  }
}

const API_KEY = process.env.DOCUMENT_INTAKE_API_KEY;
if (!API_KEY) {
  console.error("❌ DOCUMENT_INTAKE_API_KEY not found in environment or .env file");
  process.exit(1);
}

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;

/* ─── Prompts ─── */

const NOTES_PROMPT = `You are a career counselor's assistant. You are given an image of handwritten or typed interview notes.
Carefully read the image and extract the information into this JSON format:
{
  "careerGoal": "<text>",
  "interests": "<text>",
  "financial": "<text>",
  "concerns": "<text>",
  "impression": "<text>"
}
Do NOT include any student names, birthdates, IDs, or personal information.
Return ONLY the JSON object.`;

const DOC_PROMPTS: Record<string, string> = {
  ncae: `You are a data extraction specialist for Philippine education documents.
You are given an image of an NCAE result sheet. Extract and return JSON:
{
  "strand_scores": { "<strand>": <score>, ... },
  "overall_percentile": <number or null>,
  "recommended_strand": "<string or null>"
}
Do NOT include any student names, birthdates, IDs, or personal information. Return ONLY JSON.`,

  form_137: `You are a data extraction specialist for Philippine education documents.
You are given an image of a Form 137 / Report Card. Extract and return JSON:
{
  "subjects": [{ "name": "<name>", "grade": <number>, "year": "<year>" }, ...],
  "gwa": <number or null>,
  "school_year": "<string or null>"
}
Do NOT include any student names, birthdates, IDs, or personal information. Return ONLY JSON.`,

  nat: `You are a data extraction specialist for Philippine education documents.
You are given an image of a NAT score sheet. Extract and return JSON:
{
  "subjects": { "<subject>": <score>, ... },
  "composite_score": <number or null>,
  "mastery_level": "<string or null>"
}
Do NOT include any student names, birthdates, IDs, or personal information. Return ONLY JSON.`,
};

/* ─── Helper ─── */

async function extractFromImage(imagePath: string, prompt: string): Promise<Record<string, unknown>> {
  const absolutePath = path.resolve(imagePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const imageBuffer = fs.readFileSync(absolutePath);
  const base64Data = imageBuffer.toString("base64");
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  const mimeType = mimeMap[ext] || "image/jpeg";

  console.log(`  📤 Sending to Gemini Vision (${(imageBuffer.length / 1024).toFixed(0)} KB, ${mimeType})...`);

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Data } },
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
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

/* ─── Main ─── */

const TEST_FILES = [
  { path: "test/counselor-notes.jpg", type: "notes", label: "Counselor Notes" },
  { path: "test/NCAE-results.png", type: "ncae", label: "NCAE Results" },
  { path: "test/report-card.jpg", type: "form_137", label: "Report Card / Form 137" },
];

async function main() {
  const argPath = process.argv[2];
  const argType = process.argv[3];

  const filesToTest = argPath
    ? [{ path: argPath, type: argType || "notes", label: argPath }]
    : TEST_FILES;

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  🧪 Gemini Vision Extraction Test");
  console.log("═══════════════════════════════════════════════════\n");

  for (const testFile of filesToTest) {
    console.log(`\n🔍 ${testFile.label}`);
    console.log(`   File: ${testFile.path}`);
    console.log("──────────────────────────────────────────────────");

    if (!fs.existsSync(path.resolve(testFile.path))) {
      console.log("   ⚠️  File not found, skipping.\n");
      continue;
    }

    try {
      const prompt = testFile.type === "notes"
        ? NOTES_PROMPT
        : DOC_PROMPTS[testFile.type] || NOTES_PROMPT;

      const result = await extractFromImage(testFile.path, prompt);

      console.log("  ✅ Extraction successful!\n");
      console.log(JSON.stringify(result, null, 2));
      console.log("");
    } catch (err) {
      console.error(`  ❌ Failed: ${err instanceof Error ? err.message : err}\n`);
    }
  }

  console.log("═══════════════════════════════════════════════════\n");
}

main();

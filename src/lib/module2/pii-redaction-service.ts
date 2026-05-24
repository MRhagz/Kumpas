import sharp from "sharp";

const GEMINI_API_KEY = process.env.DOCUMENT_INTAKE_API_KEY!;
const GEMINI_MODEL = "gemini-2.5-flash";
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
  box_2d: [number, number, number, number];
}

export interface RedactionResult {
  redactedBuffer: Buffer;
  piiCount: number;
  piiRegions: PIIRegion[];
}

export class PIIRedactionService {
  async redact(imageBuffer: Buffer, mimeType: string): Promise<RedactionResult> {
    const base64 = imageBuffer.toString("base64");

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PII_DETECTION_PROMPT },
              { inlineData: { mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Gemini PII detection failed: ${detail}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed: { pii_regions?: PIIRegion[] };
    try {
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Failed to parse Gemini PII response: ${rawText.slice(0, 200)}`);
    }

    const regions = parsed.pii_regions ?? [];

    if (regions.length === 0) {
      const passthrough = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
      return { redactedBuffer: passthrough, piiCount: 0, piiRegions: [] };
    }

    const metadata = await sharp(imageBuffer).metadata();
    const imgWidth = metadata.width ?? 1;
    const imgHeight = metadata.height ?? 1;

    const pad = 4;
    const rects = regions
      .map((r) => {
        const [ymin, xmin, ymax, xmax] = r.box_2d;
        const x = Math.round((xmin / 1000) * imgWidth) - pad;
        const y = Math.round((ymin / 1000) * imgHeight) - pad;
        const w = Math.round(((xmax - xmin) / 1000) * imgWidth) + pad * 2;
        const h = Math.round(((ymax - ymin) / 1000) * imgHeight) + pad * 2;
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black"/>`;
      })
      .join("");

    const svgOverlay = Buffer.from(
      `<svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`,
    );

    const redactedBuffer = await sharp(imageBuffer)
      .composite([{ input: svgOverlay, top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    return { redactedBuffer, piiCount: regions.length, piiRegions: regions };
  }
}

export const piiRedactionService = new PIIRedactionService();

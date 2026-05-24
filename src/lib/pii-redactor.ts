/**
 * PII (Personally Identifiable Information) detection and redaction.
 *
 * Uses regex pattern matching tailored to Philippine student documents
 * (Form 137, NCAE, NAT score sheets). Covers: names, birthdates,
 * student IDs/LRNs, addresses, phone numbers, emails, parent names,
 * school names.
 */

import type { PIIMatch, PIIType, OCRWordBox } from "@/types";

/* ─────────────────────────────────────────────────────────
 * PII detection patterns
 * ───────────────────────────────────────────────────────── */

interface PIIPattern {
  type: PIIType;
  regex: RegExp;
  /** Minimum match length to reduce false positives */
  minLen?: number;
}

const PII_PATTERNS: PIIPattern[] = [
  // LRN (Learner Reference Number) — exactly 12 digits
  { type: "lrn", regex: /\b\d{12}\b/g },

  // Student ID patterns — "ID No.", "Student No.", etc. followed by digits
  {
    type: "student_id",
    regex:
      /(?:(?:ID|Student|Learner|LRN)\s*(?:No\.?|Number|#)\s*:?\s*)(\d[\d\s-]{4,})/gi,
  },

  // Email addresses
  { type: "email", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi },

  // Philippine phone numbers
  {
    type: "phone",
    regex: /(?:\+63|0)\s*(?:\d[\d\s-]{8,12})\b/g,
  },

  // Dates (birthdates) — various formats
  {
    type: "birthdate",
    regex:
      /\b(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/gi,
  },

  // Date label patterns — "Date of Birth:", "Birthday:", etc.
  {
    type: "birthdate",
    regex:
      /(?:Date\s+of\s+Birth|Birthday|Birth\s*date|DOB|D\.O\.B\.?)\s*:?\s*[\w\s,.\/-]{6,30}/gi,
  },

  // Address patterns — multi-word after "Address:" label
  {
    type: "address",
    regex:
      /(?:Address|Residence|Home\s*Address)\s*:?\s*[A-Za-z0-9\s,.#-]{10,120}/gi,
    minLen: 15,
  },

  // Parent/guardian name patterns
  {
    type: "parent_name",
    regex:
      /(?:(?:Father|Mother|Parent|Guardian)(?:'s)?\s*(?:Name)?\s*:?\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/g,
  },

  // School name patterns
  {
    type: "school_name",
    regex:
      /(?:(?:School|Institution|Academy|College|University)\s*(?:Name)?\s*:?\s*)([A-Z][A-Za-z\s.]+(?:School|Academy|College|University|Institute|Seminary)[A-Za-z\s.]*)/gi,
  },

  // Name field labels followed by proper-case names
  {
    type: "name",
    regex:
      /(?:(?:Name|Pupil|Student|Learner)\s*(?:of\s*(?:Pupil|Student|Learner))?\s*:?\s*)([A-Z][a-z]+(?:[,\s]+[A-Z][a-z]+){1,4})/g,
  },

  // Standalone proper name sequences (3+ capitalized words) — higher false positive risk
  {
    type: "name",
    regex: /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){2,})\b/g,
    minLen: 10,
  },
];

/* Known non-name words that appear on academic documents */
const FALSE_POSITIVE_NAMES = new Set([
  "Republic of the Philippines",
  "Department of Education",
  "Division of",
  "National Career Assessment",
  "National Achievement Test",
  "Senior High School",
  "Junior High School",
  "General Average",
  "Scholastic Record",
  "School Form",
  "Career Assessment",
  "Technology and Livelihood",
  "Humanities and Social",
  "Science and Technology",
  "Accountancy Business",
  "Information Communication",
  "Personal Development",
  "Physical Education",
  "Earth and Life",
  "General Mathematics",
  "Oral Communication",
  "Media Information",
  "Filipino Values",
  "Araling Panlipunan",
  "Edukasyon Sa",
  "Teknolohiya At",
  "Makabayan Arts",
]);

/**
 * Detect PII in OCR text. Returns all matches found.
 */
export function detectPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];

  for (const pattern of PII_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const fullMatch = match[0];
      // Use captured group if present (for labeled patterns), else full match
      const matchedText = match[1] ?? fullMatch;

      if (pattern.minLen && matchedText.length < pattern.minLen) continue;

      // Filter false positives for name-type matches
      if (pattern.type === "name" || pattern.type === "parent_name") {
        const isFalsePositive = Array.from(FALSE_POSITIVE_NAMES).some(
          (fp) =>
            matchedText.includes(fp) ||
            fp.includes(matchedText)
        );
        if (isFalsePositive) continue;
      }

      // Calculate start index of the actual matched text within the full match
      const textStart = match[1]
        ? match.index + fullMatch.indexOf(matchedText)
        : match.index;

      matches.push({
        type: pattern.type,
        text: matchedText,
        startIndex: textStart,
        endIndex: textStart + matchedText.length,
      });
    }
  }

  // Deduplicate overlapping matches — keep the longer one
  return deduplicateMatches(matches);
}

/**
 * Remove overlapping PII matches, keeping the longer match.
 */
function deduplicateMatches(matches: PIIMatch[]): PIIMatch[] {
  if (matches.length <= 1) return matches;

  // Sort by start index
  const sorted = [...matches].sort((a, b) => a.startIndex - b.startIndex);
  const result: PIIMatch[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];

    // Check overlap
    if (curr.startIndex < prev.endIndex) {
      // Keep the longer one
      if (curr.endIndex - curr.startIndex > prev.endIndex - prev.startIndex) {
        result[result.length - 1] = curr;
      }
      // Otherwise keep prev (do nothing)
    } else {
      result.push(curr);
    }
  }

  return result;
}

/**
 * Map PII text matches to their bounding boxes from OCR word data.
 */
export function mapPIIToBboxes(
  matches: PIIMatch[],
  words: OCRWordBox[]
): PIIMatch[] {
  return matches.map((m) => {
    // Find words whose text appears in the matched PII text
    const matchedWords = words.filter((w) => {
      const wordLower = w.text.toLowerCase().replace(/[^a-z0-9]/g, "");
      const piiLower = m.text.toLowerCase().replace(/[^a-z0-9]/g, "");
      return piiLower.includes(wordLower) && wordLower.length > 1;
    });

    return {
      ...m,
      bboxes: matchedWords.map((w) => w.bbox),
    };
  });
}

/**
 * Redact PII from text by replacing matched regions with [REDACTED].
 */
export function redactText(text: string, matches: PIIMatch[]): string {
  if (matches.length === 0) return text;

  // Sort by start index descending so we can replace from end to start
  const sorted = [...matches].sort((a, b) => b.startIndex - a.startIndex);
  let result = text;

  for (const m of sorted) {
    result =
      result.slice(0, m.startIndex) +
      "[REDACTED]" +
      result.slice(m.endIndex);
  }

  return result;
}

/**
 * Create a redacted copy of an image by drawing black rectangles
 * over PII regions identified by bounding boxes.
 *
 * @returns Object URL of the redacted image (caller must revoke when done)
 */
export async function redactImage(
  imageFile: File,
  piiWithBboxes: PIIMatch[]
): Promise<string> {
  const allBboxes = piiWithBboxes.flatMap((m) => m.bboxes ?? []);

  if (allBboxes.length === 0) {
    // No regions to redact — return original
    return URL.createObjectURL(imageFile);
  }

  const img = await loadImage(imageFile);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;

  // Draw original image
  ctx.drawImage(img, 0, 0);

  // Draw black rectangles over PII regions with slight padding
  ctx.fillStyle = "#000000";
  const pad = 4;
  for (const bbox of allBboxes) {
    ctx.fillRect(
      bbox.x0 - pad,
      bbox.y0 - pad,
      bbox.x1 - bbox.x0 + pad * 2,
      bbox.y1 - bbox.y0 + pad * 2
    );
  }

  // Convert to blob URL
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png")
  );
  return URL.createObjectURL(blob);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

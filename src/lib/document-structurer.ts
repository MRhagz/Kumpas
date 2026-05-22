/**
 * Local (regex/heuristic) document structuring.
 *
 * Attempts to parse OCR text into structured academic data
 * based on known Philippine document formats.
 * Returns null if confidence is too low → triggers AI fallback.
 */

import type { ExtractedAcademicData, NCAEData, NATData, Form137Data } from "@/types";

/**
 * Attempt to structure OCR text into academic data using local regex parsing.
 * @returns structured data, or null if confidence is too low.
 */
export function tryStructureLocally(
  text: string,
  docType: string
): ExtractedAcademicData | null {
  switch (docType) {
    case "ncae":
      return tryParseNCAE(text);
    case "form_137":
      return tryParseForm137(text);
    case "nat":
      return tryParseNAT(text);
    default:
      return null;
  }
}

/* ─── NCAE Parsing ─── */

const NCAE_STRAND_PATTERNS: Record<string, RegExp> = {
  "General Scholastic Aptitude": /General\s*Scholastic\s*(?:Aptitude|Ability)\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  "Scientific Ability": /Scientific\s*(?:Ability|Aptitude)\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  "Reading Comprehension": /Reading\s*Comprehension\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  "Mathematical Ability": /Mathematical\s*(?:Ability|Aptitude)\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  "Verbal Ability": /Verbal\s*(?:Ability|Aptitude)\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  "Clerical Ability": /Clerical\s*(?:Ability|Aptitude)\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  "Manipulative Skills": /Manipulative\s*Skills?\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  "Non-Verbal Ability": /Non[\s-]*Verbal\s*(?:Ability|Aptitude)\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  "Entrepreneurial Skills": /Entrepreneurial\s*Skills?\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
};

const NCAE_STRAND_RECO =
  /(?:Recommended|Suggested)\s*(?:Strand|Track)\s*[:\s]*([A-Za-z\s&,-]+)/i;

function tryParseNCAE(text: string): ExtractedAcademicData | null {
  const strandScores: Record<string, number> = {};
  let matchCount = 0;

  for (const [label, regex] of Object.entries(NCAE_STRAND_PATTERNS)) {
    const match = text.match(regex);
    if (match?.[1]) {
      const val = parseFloat(match[1]);
      if (!isNaN(val) && val >= 0 && val <= 100) {
        strandScores[label] = val;
        matchCount++;
      }
    }
  }

  // Require at least 3 strand scores for a valid NCAE parse
  if (matchCount < 3) return null;

  const overallMatch = text.match(
    /(?:Overall|General|Total)\s*(?:Percentile|Score|Rating)\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i
  );
  const recoMatch = text.match(NCAE_STRAND_RECO);

  const data: NCAEData = {
    strand_scores: strandScores,
    overall_percentile: overallMatch?.[1]
      ? parseFloat(overallMatch[1])
      : undefined,
    recommended_strand: recoMatch?.[1]?.trim(),
  };

  return { type: "ncae", data };
}

/* ─── NAT Parsing ─── */

const NAT_SUBJECT_PATTERNS: Record<string, RegExp> = {
  Science: /Science\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  Mathematics: /Math(?:ematics)?\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  English: /English\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  Filipino: /Filipino\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  "Araling Panlipunan": /Araling\s*Panlipunan\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  HeKaSi: /(?:HeKaSi|Hekasi)\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
  "Critical Thinking": /Critical\s*Thinking\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i,
};

const NAT_MASTERY_LEVELS = [
  "Mastered",
  "Closely Approximating Mastery",
  "Moving Towards Mastery",
  "Average",
  "Low",
  "Did Not Meet Expectations",
];

function tryParseNAT(text: string): ExtractedAcademicData | null {
  const subjects: Record<string, number> = {};
  let matchCount = 0;

  for (const [label, regex] of Object.entries(NAT_SUBJECT_PATTERNS)) {
    const match = text.match(regex);
    if (match?.[1]) {
      const val = parseFloat(match[1]);
      if (!isNaN(val) && val >= 0 && val <= 100) {
        subjects[label] = val;
        matchCount++;
      }
    }
  }

  // Fallback: try generic "Subject : Score" patterns
  if (matchCount < 2) {
    const genericPattern = /([A-Za-z\s]{3,30})\s*[:\s]+(\d{1,3}(?:\.\d+)?)\s*%?/g;
    let genMatch;
    while ((genMatch = genericPattern.exec(text)) !== null) {
      const label = genMatch[1].trim();
      const val = parseFloat(genMatch[2]);
      if (!isNaN(val) && val >= 0 && val <= 100 && label.length > 3) {
        subjects[label] = val;
        matchCount++;
      }
    }
  }

  if (matchCount < 2) return null;

  const compositeMatch = text.match(
    /(?:Composite|Overall|Total|MPS)\s*(?:Score|Rating)?\s*[:\s]*(\d{1,3}(?:\.\d+)?)/i
  );

  // Find mastery level
  let mastery: string | undefined;
  for (const level of NAT_MASTERY_LEVELS) {
    if (text.toLowerCase().includes(level.toLowerCase())) {
      mastery = level;
      break;
    }
  }

  const data: NATData = {
    subjects,
    composite_score: compositeMatch?.[1]
      ? parseFloat(compositeMatch[1])
      : undefined,
    mastery_level: mastery,
  };

  return { type: "nat", data };
}

/* ─── Form 137 Parsing ─── */

function tryParseForm137(text: string): ExtractedAcademicData | null {
  const subjects: Form137Data["subjects"] = [];

  // Pattern: Subject Name followed by grade (number between 60-100)
  // Common format in Form 137: subject lines with grades at the end
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Match patterns like "Mathematics    87" or "Science: 92"
    const gradeMatch = line.match(
      /^([A-Za-z\s&.,()-]{3,40})\s+(\d{2,3}(?:\.\d+)?)\s*$/
    );
    if (gradeMatch) {
      const name = gradeMatch[1].trim();
      const grade = parseFloat(gradeMatch[2]);
      if (!isNaN(grade) && grade >= 60 && grade <= 100 && name.length >= 3) {
        subjects.push({ name, grade, year: "" });
      }
    }

    // Also try "Subject: Grade" format
    const colonMatch = line.match(
      /([A-Za-z\s&.,()-]{3,40})\s*:\s*(\d{2,3}(?:\.\d+)?)/
    );
    if (colonMatch && !gradeMatch) {
      const name = colonMatch[1].trim();
      const grade = parseFloat(colonMatch[2]);
      if (!isNaN(grade) && grade >= 60 && grade <= 100 && name.length >= 3) {
        subjects.push({ name, grade, year: "" });
      }
    }
  }

  if (subjects.length < 3) return null;

  // Try to find school year
  const syMatch = text.match(
    /(?:School\s*Year|S\.?Y\.?|Academic\s*Year)\s*[:\s]*(\d{4}\s*[-–]\s*\d{4})/i
  );

  // Try to find GWA/General Average
  const gwaMatch = text.match(
    /(?:General\s*(?:Weighted)?\s*Average|GWA|G\.W\.A\.?|Gen\.?\s*Ave\.?)\s*[:\s]*(\d{2,3}(?:\.\d+)?)/i
  );

  const data: Form137Data = {
    subjects,
    gwa: gwaMatch?.[1] ? parseFloat(gwaMatch[1]) : undefined,
    school_year: syMatch?.[1]?.trim(),
  };

  return { type: "form_137", data };
}

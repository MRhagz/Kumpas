export type TranscriptionState = 
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; text: string }
    | { status: "error"; message: string };

export interface WysiwygFieldProps {
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  iconFg: string;
  labelColor: string;
  placeholder: string;
  htmlValue: string;
  onChange: (html: string) => void;
}

export interface FileSlotProps {
  index: number;
  /** All files attached to this slot. One entry for NCAE/NAT; one-or-more for Form 137. */
  files: File[];
  /** Per-file processing state, same length as `files`. */
  perFileProcessing: DocumentProcessingState[];
  docType: string;
  excludeTypes?: string[];
  /** Append the given files to this slot and start uploads. */
  onFilesAdd: (files: File[]) => void;
  /** Remove the file at the given index in `files`. */
  onFileRemove: (fileIndex: number) => void;
  onTypeChange: (type: string) => void;
}

/* ─── OCR types ─── */
export interface OCRWordBox {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OCRResult {
  text: string;
  confidence: number;
  words: OCRWordBox[];
  /** Page index for multi-page PDFs */
  page?: number;
}

/* ─── PII types ─── */
export type PIIType =
  | "name"
  | "birthdate"
  | "student_id"
  | "lrn"
  | "address"
  | "parent_name"
  | "school_name"
  | "phone"
  | "email";

export interface PIIMatch {
  type: PIIType;
  text: string;
  startIndex: number;
  endIndex: number;
  /** Bounding boxes from OCR words that overlap this match */
  bboxes?: OCRWordBox["bbox"][];
}

/* ─── Document processing pipeline ─── */
export type DocumentProcessingStep =
  | "idle"
  | "ocr_scanning"
  | "pii_detecting"
  | "pii_redacting"
  | "structuring"
  | "ai_structuring"
  | "complete"
  | "error";

export interface DocumentProcessingState {
  step: DocumentProcessingStep;
  progress: number; // 0-100
  error?: string;
  ocrResult?: OCRResult;
  piiMatches?: PIIMatch[];
  redactedText?: string;
  redactedImageUrl?: string;
  extractedData?: ExtractedAcademicData;
}

/* ─── Extracted academic data ─── */
export interface NCAEData {
  strand_scores: Record<string, number>;
  overall_percentile?: number;
  recommended_strand?: string;
}

export interface NATData {
  subjects: Record<string, number>;
  composite_score?: number;
  mastery_level?: string;
}

export interface Form137Data {
  subjects: { name: string; grade: number; year: string }[];
  gwa?: number;
  school_year?: string;
}

export type ExtractedAcademicData =
  | { type: "ncae"; data: NCAEData }
  | { type: "form_137"; data: Form137Data }
  | { type: "nat"; data: NATData };

/* ─── Module 2 — session lifecycle types ─── */

export interface Session {
  id: string;
  counselor_id: string | null;
  status: "active" | "completed" | "expired" | "cancelled";
  approved_profile: ApprovedProfile | null;
  created_at: string;
  last_activity: string;
  expires_at: string;
}

export interface SessionNotes {
  id: string;
  session_id: string;
  career_goal: string;
  interests: string;
  financial: string;
  concerns: string;
  impression: string;
}

export interface ExtractionResult {
  id: string;
  session_id: string;
  document_type: "ncae" | "form_137" | "nat";
  structured_data: ExtractedAcademicData;
  redacted_image_path: string | null;
  created_at: string;
}

export interface CorrectionLog {
  session_id: string;
  field_name: string;
  extracted_value: string | null;
  corrected_value: string;
}

export interface ApprovedProfile {
  sessionId: string;
  sessionTimestamp: string;
  counselorNotes: {
    careerGoal: string;
    interests: string;
    financial: string;
    concerns: string;
    impression: string;
  };
  academicData: {
    ncae?: NCAEData;
    form137?: Form137Data;
    nat?: NATData;
  };
}

export interface UploadedDocument {
  documentId: string;
  slotIndex: 1 | 2 | 3;
  docType: string;
  extractedData: ExtractedAcademicData;
  redactedImageUrl: string | null;
  originalExtractedData: ExtractedAcademicData;
}

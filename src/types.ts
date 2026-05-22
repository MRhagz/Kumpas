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
  file: File | null;
  docType: string;
  excludeTypes?: string[];
  onFileChange: (file: File | null) => void;
  onTypeChange: (type: string) => void;
  /** Optional: processing state from the document pipeline */
  processingState?: DocumentProcessingState;
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

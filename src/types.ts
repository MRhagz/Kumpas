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
  /** Zero or one file per academic document type. */
  files: File[];
  /** Per-file processing state, same length as `files`. */
  perFileProcessing: DocumentProcessingState[];
  docType: string;
  excludeTypes?: string[];
  /** Select or explicitly replace this slot's file and start its upload. */
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
  | "removing"
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
  strand_scores: Record<string, number | null>;
  overall_percentile?: number | null;
  recommended_strand?: string | null;
}

export interface NATData {
  subjects: Record<string, number | null>;
  composite_score?: number | null;
  mastery_level?: string | null;
}

export interface Form137Data {
  subjects: { id?: string; name: string; grade: number | null; year: string; grade_level?: string | null }[];
  gwa?: number | null;
  school_year?: string | null;
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
  module_status: {
    intake: "not_started" | "in_progress" | "complete" | "failed";
    profile: "not_started" | "in_progress" | "complete" | "failed";
    analysis: "not_started" | "in_progress" | "complete" | "failed";
    report: "not_started" | "in_progress" | "complete" | "failed";
  };
  report_status: "not_started" | "generating" | "ready" | "downloaded" | "failed";
  created_at: string;
  last_activity: string;
  expires_at: string;
  completed_at: string | null;
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
  /** Present on reviewed snapshots; legacy profiles require reconfirmation. */
  profileVersion?: number;
  confirmedAt?: string;
  inputEvidence?: {
    documents: { documentId: string; documentType: string; revision: number;
      status: "provided" | "unreadable" | "unsupported"; source: ExtractionProvenance }[];
    notes: { revision: number; source: Record<string, unknown> | null };
  };
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
  revision?: number;
  evidenceState?: "provided" | "unreadable" | "unsupported";
  provenance?: ExtractionProvenance;
}

export interface ExtractionProvenance {
  documentId?: string;
  extractedAt?: string;
  model?: string;
  promptVersion?: string;
  /** Page is unknown for legacy data and tiled multi-page renders. */
  page?: number | null;
}

export interface ExtractionDraft {
  id: string;
  document_type: "ncae" | "form_137" | "nat";
  structured_data: ExtractedAcademicData;
  original_data: ExtractedAcademicData;
  evidence_state: "provided" | "unreadable" | "unsupported";
  provenance: ExtractionProvenance;
  draft_revision: number;
}

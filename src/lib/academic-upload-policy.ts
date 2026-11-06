// SW-03: decimal MB, approved by the team on 4 November 2026.
export const MAX_ACADEMIC_FILE_BYTES = 10_000_000;
// Multipart headers, field values and boundaries are not part of the file limit.
export const MAX_ACADEMIC_REQUEST_BYTES = MAX_ACADEMIC_FILE_BYTES + 64 * 1024;
export const ACADEMIC_SIZE_ERROR = "File exceeds 10 MB (10,000,000 bytes). Choose a smaller file.";
export const ACADEMIC_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const ACADEMIC_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf";
export const ACADEMIC_DOCUMENT_TYPES = ["form_137", "ncae", "nat"];

export function academicFileSizeError(file: Pick<File, "size">): string | null {
  if (file.size > MAX_ACADEMIC_FILE_BYTES) return ACADEMIC_SIZE_ERROR;
  if (file.size === 0) return "This file is empty. Choose a JPEG, PNG, WEBP or PDF document.";
  return null;
}

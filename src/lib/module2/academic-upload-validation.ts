import sharp from "sharp";
import { createAcademicPdfTask } from "./academic-pdf-renderer";
import {
  ACADEMIC_DOCUMENT_TYPES,
  ACADEMIC_MIME_TYPES,
  ACADEMIC_SIZE_ERROR,
  MAX_ACADEMIC_REQUEST_BYTES,
  academicFileSizeError,
} from "@/lib/academic-upload-policy";

export class UploadValidationError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function uploadErrorResponse(error: unknown): Response | null {
  return error instanceof UploadValidationError
    ? Response.json({ error: error.message }, { status: error.status })
    : null;
}

function bodyParseError(error: unknown): UploadValidationError {
  // Next/Undici may reject before a FormData or File exists. Inspect causes too.
  let cause = error;
  for (let depth = 0; depth < 4 && cause instanceof Error; depth++) {
    if (/body.*(?:exceed|too large|size limit)|payload too large|request entity too large/i.test(cause.message)) {
      return new UploadValidationError(ACADEMIC_SIZE_ERROR, 413);
    }
    cause = cause.cause;
  }
  return new UploadValidationError("Could not read the upload. Choose the file again and retry.", 400);
}

export async function readBoundedForm(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_ACADEMIC_REQUEST_BYTES) {
    throw new UploadValidationError(ACADEMIC_SIZE_ERROR, 413);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new UploadValidationError("Send one file and its document type as multipart/form-data.", 400);
  }

  const chunks: Buffer[] = [];
  const reader = request.body?.getReader();
  let size = 0;
  let form: FormData;
  try {
    if (!reader) throw new Error("Missing upload body");
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ACADEMIC_REQUEST_BYTES) {
        void reader.cancel().catch(() => {});
        throw new UploadValidationError(ACADEMIC_SIZE_ERROR, 413);
      }
      chunks.push(Buffer.from(value));
    }
    form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": request.headers.get("content-type")! },
    }).formData();
  } catch (error) {
    if (error instanceof UploadValidationError) throw error;
    throw bodyParseError(error);
  } finally {
    reader?.releaseLock();
  }

  return form;
}

export async function readAcademicUpload(request: Request) {
  const form = await readBoundedForm(request);
  const file = form.get("file");
  const docType = form.get("docType");
  if (form.getAll("file").length !== 1 || !(file instanceof File) ||
      form.getAll("docType").length !== 1 || typeof docType !== "string" ||
      !ACADEMIC_DOCUMENT_TYPES.includes(docType)) {
    throw new UploadValidationError("Choose exactly one file and a document type: Form 137, NCAE or NAT.", 400);
  }
  const sizeError = academicFileSizeError(file);
  if (sizeError) throw new UploadValidationError(sizeError, file.size ? 413 : 400);
  const replacement = form.get("replaceDocumentId");
  if (form.getAll("replaceDocumentId").length > 1 ||
      (replacement !== null && (typeof replacement !== "string" || !/^[0-9a-f-]{36}$/i.test(replacement)))) {
    throw new UploadValidationError("Choose Replace on the current document and retry.", 400);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = await validateAcademicContent(buffer, file.type);
  return { buffer, mimeType, docType, replaceDocumentId: replacement as string | null };
}

export async function validateAcademicContent(buffer: Buffer, declaredType: string): Promise<string> {
  let mimeType: string;
  try {
    if (buffer.subarray(0, 5).toString() === "%PDF-") {
      if (!/%%EOF\s*$/.test(buffer.subarray(-1024).toString())) throw new Error("Truncated PDF");
      const task = await createAcademicPdfTask(buffer);
      try {
        const pdf = await task.promise;
        if (pdf.numPages === 0) throw new Error("Empty PDF");
        for (let page = 1; page <= pdf.numPages; page++) {
          const documentPage = await pdf.getPage(page);
          await documentPage.getOperatorList();
          documentPage.cleanup();
        }
      } finally {
        await task.destroy();
      }
      mimeType = "application/pdf";
    } else {
      const image = sharp(buffer, { failOn: "warning" });
      const metadata = await image.metadata();
      const formats: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
      mimeType = formats[metadata.format ?? ""];
      if (!mimeType) throw new Error("Unsupported image");
      await image.stats(); // Decode all pixels; metadata/signatures alone accept truncated files.
    }
  } catch {
    throw new UploadValidationError("This file is unsupported, corrupt or password-protected. Export a readable JPEG, PNG, WEBP or unencrypted PDF and retry.", 415);
  }
  if (declaredType && declaredType !== "application/octet-stream" &&
      (!ACADEMIC_MIME_TYPES.includes(declaredType) || declaredType !== mimeType)) {
    throw new UploadValidationError("The file content does not match its reported type. Export it as JPEG, PNG, WEBP or PDF and retry.", 415);
  }
  return mimeType;
}

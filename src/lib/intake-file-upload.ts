"use client";
import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { academicFileSizeError } from "@/lib/academic-upload-policy";

interface UploadDetails {
  docType: string;
  replaceDocumentId?: string;
  revision?: number;
  notesReviewed?: boolean;
}

// Resumes transient network interruptions without saving filenames, upload URLs,
// tokens or document contents in browser storage.
export async function uploadIntakeFile(sessionId: string, file: File, details: UploadDetails): Promise<string> {
  const sizeError = academicFileSizeError(file);
  if (sizeError) throw new Error(sizeError);
  const mimeType = file.type || "application/octet-stream";
  const endpoint = `/api/sessions/${sessionId}/uploads`;
  const prepared = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...details, size: file.size, mimeType }) });
  const body = await prepared.json().catch(() => ({}));
  if (!prepared.ok) throw new Error(body.error || "Could not prepare the upload. Try again.");
  const uploadId = body.uploadId as string;
  try {
    const client = createClient();
    // Forward the credential only; Storage validates it and applies RLS.
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) throw new Error("Sign in again before uploading.");
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    origin.hostname = origin.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: new URL("/storage/v1/upload/resumable", origin).href,
        headers: { authorization: `Bearer ${session.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        metadata: { bucketName: body.bucket, objectName: body.objectPath, contentType: mimeType, cacheControl: "0" },
        chunkSize: 6 * 1024 * 1024, uploadDataDuringCreation: true,
        retryDelays: [2000], storeFingerprintForResuming: false, removeFingerprintOnSuccess: true,
        onShouldRetry: error => ![400, 401, 403, 404, 409, 413, 415].includes(error.originalResponse?.getStatus() ?? 0),
        onSuccess: () => resolve(),
        onError: () => {
          void upload.abort(true).catch(() => {});
          reject(new Error("Upload interrupted or expired. Choose the file again and retry."));
        },
      });
      upload.start();
    });
    return uploadId;
  } catch (error) {
    await fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId }) }).catch(() => {});
    throw error;
  }
}

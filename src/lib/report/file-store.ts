import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { StoredReportPdf } from "@/lib/report/types";

export const REPORT_PDF_BUCKET = "kumpas-reports";
export const REPORT_PDF_SIGNED_URL_TTL_SECONDS = 30 * 60;

const REPORT_PDF_CONTENT_TYPE = "application/pdf";

interface StorageError {
  message: string;
}

interface StorageObject {
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  last_accessed_at?: string | null;
}

interface StorageBucketClient {
  upload(
    path: string,
    fileBody: Buffer,
    options: {
      contentType: string;
      upsert: boolean;
    },
  ): Promise<{ error: StorageError | null }>;
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<{ data: { signedUrl: string } | null; error: StorageError | null }>;
  list(
    path?: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<{ data: StorageObject[] | null; error: StorageError | null }>;
  remove(paths: string[]): Promise<{ error: StorageError | null }>;
}

interface ReportStorageClient {
  storage: {
    from(bucket: string): StorageBucketClient;
  };
}

export interface PdfFileStoreOptions {
  bucketName?: string;
  signedUrlTtlSeconds?: number;
  now?: () => Date;
  client?: ReportStorageClient;
  supabaseUrl?: string;
  serviceRoleKey?: string;
}

export interface ReportPdfRetentionResult {
  cutoff: string;
  scannedCount: number;
  deletedCount: number;
  warnings: string[];
}

export class PdfFileStore {
  private readonly bucketName: string;
  private readonly signedUrlTtlSeconds: number;
  private readonly now: () => Date;
  private client?: ReportStorageClient;
  private readonly supabaseUrl?: string;
  private readonly serviceRoleKey?: string;

  constructor(options: PdfFileStoreOptions = {}) {
    this.bucketName = options.bucketName ?? REPORT_PDF_BUCKET;
    this.signedUrlTtlSeconds =
      options.signedUrlTtlSeconds ?? REPORT_PDF_SIGNED_URL_TTL_SECONDS;
    this.now = options.now ?? (() => new Date());
    this.client = options.client;
    this.supabaseUrl = options.supabaseUrl;
    this.serviceRoleKey = options.serviceRoleKey;
  }

  async uploadReportPdf(
    sessionId: string,
    pdfBuffer: Buffer,
  ): Promise<StoredReportPdf> {
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.byteLength === 0) {
      throw new Error("PDF buffer is required to store a report.");
    }

    const objectKey = getReportPdfObjectKey(sessionId);
    const bucket = this.getClient().storage.from(this.bucketName);
    const { error: uploadError } = await bucket.upload(objectKey, pdfBuffer, {
      contentType: REPORT_PDF_CONTENT_TYPE,
      upsert: true,
    });

    if (uploadError) {
      throw new Error(
        `Failed to upload report PDF: ${formatStorageError(uploadError, this.bucketName)}`,
      );
    }

    const { data, error: signedUrlError } = await bucket.createSignedUrl(
      objectKey,
      this.signedUrlTtlSeconds,
    );

    if (signedUrlError) {
      throw new Error(
        `Failed to create signed report URL: ${formatStorageError(
          signedUrlError,
          this.bucketName,
        )}`,
      );
    }

    if (!data?.signedUrl) {
      throw new Error("Supabase did not return a signed report URL.");
    }

    const createdAt = this.now();

    return {
      sessionId: normalizeSessionId(sessionId),
      downloadUrl: data.signedUrl,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(
        createdAt.getTime() + this.signedUrlTtlSeconds * 1000,
      ).toISOString(),
      byteLength: pdfBuffer.byteLength,
    };
  }

  async deleteReportPdf(sessionId: string): Promise<void> {
    const objectKey = getReportPdfObjectKey(sessionId);
    const bucket = this.getClient().storage.from(this.bucketName);
    const { error } = await bucket.remove([objectKey]);

    if (error) {
      throw new Error(
        `Failed to delete report PDF: ${formatStorageError(error, this.bucketName)}`,
      );
    }
  }

  async purgeExpiredReportPdfs(
    retentionHours = 24,
  ): Promise<ReportPdfRetentionResult> {
    if (!Number.isFinite(retentionHours) || retentionHours <= 0) {
      throw new Error("Retention hours must be greater than zero.");
    }

    const cutoff = new Date(
      this.now().getTime() - retentionHours * 60 * 60 * 1000,
    );
    const bucket = this.getClient().storage.from(this.bucketName);
    const sessionFolders = await listAllStorageObjects(bucket, this.bucketName);
    const warnings: string[] = [];
    let scannedCount = 0;
    let deletedCount = 0;

    for (const folder of sessionFolders) {
      if (
        !folder.name ||
        folder.name.includes("/") ||
        folder.name.includes("\\")
      ) {
        continue;
      }

      const reportObjects = await listAllStorageObjects(
        bucket,
        this.bucketName,
        folder.name,
      );

      for (const reportObject of reportObjects) {
        if (!reportObject.name.endsWith(".pdf")) {
          continue;
        }

        scannedCount += 1;

        const objectTimestamp = getStorageObjectTimestamp(reportObject);

        if (!objectTimestamp || objectTimestamp > cutoff) {
          continue;
        }

        const objectKey = `${folder.name}/${reportObject.name}`;
        const { error } = await bucket.remove([objectKey]);

        if (error) {
          warnings.push(
            `Failed to delete ${objectKey}: ${formatStorageError(
              error,
              this.bucketName,
            )}`,
          );
          continue;
        }

        deletedCount += 1;
      }
    }

    return {
      cutoff: cutoff.toISOString(),
      scannedCount,
      deletedCount,
      warnings,
    };
  }

  private getClient(): ReportStorageClient {
    const client =
      this.client ??
      createClient(
        this.supabaseUrl ?? getRequiredEnv("SUPABASE_URL"),
        this.serviceRoleKey ?? getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      );

    this.client = client;

    return client;
  }
}

async function listAllStorageObjects(
  bucket: StorageBucketClient,
  bucketName: string,
  path?: string,
): Promise<StorageObject[]> {
  const objects: StorageObject[] = [];
  const pageSize = 100;
  let offset = 0;

  while (true) {
    const { data, error } = await bucket.list(path, {
      limit: pageSize,
      offset,
    });

    if (error) {
      throw new Error(
        `Failed to list report PDFs: ${formatStorageError(error, bucketName)}`,
      );
    }

    if (!data || data.length === 0) {
      break;
    }

    objects.push(...data);

    if (data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return objects;
}

function getStorageObjectTimestamp(object: StorageObject): Date | null {
  const timestamp =
    object.updated_at ?? object.created_at ?? object.last_accessed_at ?? null;

  if (!timestamp) {
    return null;
  }

  const parsedTimestamp = Date.parse(timestamp);

  if (Number.isNaN(parsedTimestamp)) {
    return null;
  }

  return new Date(parsedTimestamp);
}

function formatStorageError(error: StorageError, bucketName: string): string {
  if (/bucket not found/i.test(error.message)) {
    return `${error.message}. Create the private Supabase Storage bucket "${bucketName}" before generating reports.`;
  }

  return error.message;
}

export function getReportPdfObjectKey(sessionId: string): string {
  const normalizedSessionId = normalizeSessionId(sessionId);

  return `${normalizedSessionId}/${normalizedSessionId}.pdf`;
}

export function normalizeReportSessionId(sessionId: string): string {
  const normalizedSessionId = sessionId.trim();

  if (!normalizedSessionId) {
    throw new Error("Session id is required to store a report PDF.");
  }

  if (normalizedSessionId.includes("/") || normalizedSessionId.includes("\\")) {
    throw new Error("Session id cannot contain path separators.");
  }

  return normalizedSessionId;
}

function normalizeSessionId(sessionId: string): string {
  return normalizeReportSessionId(sessionId);
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to store report PDFs.`);
  }

  return value;
}

export const pdfFileStore = new PdfFileStore();

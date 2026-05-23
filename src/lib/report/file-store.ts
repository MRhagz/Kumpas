import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { StoredReportPdf } from "@/lib/report/types";

export const REPORT_PDF_BUCKET = "kumpas-reports";
export const REPORT_PDF_SIGNED_URL_TTL_SECONDS = 30 * 60;

const REPORT_PDF_CONTENT_TYPE = "application/pdf";

interface StorageError {
  message: string;
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
      throw new Error(`Failed to upload report PDF: ${uploadError.message}`);
    }

    const { data, error: signedUrlError } = await bucket.createSignedUrl(
      objectKey,
      this.signedUrlTtlSeconds,
    );

    if (signedUrlError) {
      throw new Error(
        `Failed to create signed report URL: ${signedUrlError.message}`,
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
      throw new Error(`Failed to delete report PDF: ${error.message}`);
    }
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

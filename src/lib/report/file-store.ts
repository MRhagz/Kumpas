import "server-only";
import { randomUUID } from "node:crypto";
import { ProviderError } from "@/lib/processing-budget";

import { createClient } from "@supabase/supabase-js";

export const REPORT_PDF_BUCKET = "kumpas-reports";
export const REPORT_PDF_ACCESS_TTL_SECONDS = 24 * 60 * 60;

const REPORT_PDF_CONTENT_TYPE = "application/pdf";
const MINIMAL_HEALTHCHECK_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n",
);

interface StorageError {
  message: string;
  statusCode?: string | number;
  originalError?: unknown;
}

interface StorageObject {
  name: string;
  created_at?: string | null;
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
  download(path: string): Promise<{ data: Blob | null; error: StorageError | null }>;
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

export interface ReportPdfStorageCheckResult {
  bucketName: string;
  objectKey: string;
  downloadVerified: boolean;
  cleanupCompleted: boolean;
  warnings: string[];
}

export class PdfFileStore {
  private readonly bucketName: string;
  private readonly now: () => Date;
  private readonly client?: ReportStorageClient;
  private readonly supabaseUrl?: string;
  private readonly serviceRoleKey?: string;

  constructor(options: PdfFileStoreOptions = {}) {
    this.bucketName = options.bucketName ?? REPORT_PDF_BUCKET;
    this.now = options.now ?? (() => new Date());
    this.client = options.client;
    this.supabaseUrl = options.supabaseUrl;
    this.serviceRoleKey = options.serviceRoleKey;
  }

  async uploadReportPdf(
    sessionId: string,
    pdfBuffer: Buffer,
    reportVersion: number,
    signal?: AbortSignal,
  ): Promise<{ byteLength: number }> {
    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.byteLength === 0) {
      throw new Error("PDF buffer is required to store a report.");
    }

    const objectKey = getReportPdfObjectKey(sessionId, reportVersion);
    const bucket = this.getClient(signal).storage.from(this.bucketName);
    const { error: uploadError } = await bucket.upload(objectKey, pdfBuffer, {
      contentType: REPORT_PDF_CONTENT_TYPE,
      upsert: false,
    });

    if (uploadError) {
      if (uploadError.originalError) throw uploadError.originalError;
      throw new ProviderError(Number(uploadError.statusCode), null, { message: "Private PDF storage unavailable." });
    }

    return { byteLength: pdfBuffer.byteLength };
  }

  async checkReportPdfStorage(): Promise<ReportPdfStorageCheckResult> {
    const sessionId = `report-storage-check-${randomUUID()}`;
    const objectKey = getReportPdfObjectKey(sessionId, 1);
    const warnings: string[] = [];
    let cleanupCompleted = false;

    try {
      await this.uploadReportPdf(sessionId, MINIMAL_HEALTHCHECK_PDF, 1);
      await this.downloadReportPdf(sessionId, 1);
    } finally {
      try {
        await this.deleteReportPdf(sessionId, 1);
        cleanupCompleted = true;
      } catch {
        warnings.push("Report storage check cleanup is pending retry.");
      }
    }

    return {
      bucketName: this.bucketName,
      objectKey,
      downloadVerified: true,
      cleanupCompleted,
      warnings,
    };
  }

  async deleteReportPdf(sessionId: string, reportVersion?: number): Promise<void> {
    const bucket = this.getClient().storage.from(this.bucketName);
    const prefix = normalizeSessionId(sessionId);
    const paths = reportVersion === undefined
      ? (await listAllStorageObjects(bucket, this.bucketName, prefix))
        .filter((object) => object.name.endsWith(".pdf") && !object.name.includes("/"))
        .map((object) => `${prefix}/${object.name}`)
      : [getReportPdfObjectKey(sessionId, reportVersion)];
    if (paths.length === 0) return;
    const { error } = await bucket.remove(paths);
    if (error) throw new Error(`Failed to delete report PDF: ${formatStorageError(error, this.bucketName)}`);
  }

  async deleteObject(objectKey: string): Promise<void> {
    const { error } = await this.getClient().storage.from(this.bucketName).remove([objectKey]);
    if (error) throw new Error("Report artifact deletion failed.");
  }

  async queueSessionReportPdfs(sessionId: string, queueDeletion: (objectKey: string) => Promise<void>): Promise<void> {
    const prefix = normalizeSessionId(sessionId);
    const objects = await listAllStorageObjects(this.getClient().storage.from(this.bucketName), this.bucketName, prefix);
    for (const object of objects) {
      if (object.name.endsWith(".pdf") && !object.name.includes("/")) {
        await queueDeletion(`${prefix}/${object.name}`);
      }
    }
  }

  // Callers authorize the exact report against persisted metadata before reading bytes.
  async downloadReportPdf(sessionId: string, reportVersion: number): Promise<Blob> {
    const bucket = this.getClient().storage.from(this.bucketName);
    const { data, error } = await bucket.download(getReportPdfObjectKey(sessionId, reportVersion));
    if (error || !data) throw new Error("Report not found or expired.");
    return data;
  }

  async purgeExpiredReportPdfs(
    publishedExpiry: (objectKey: string) => Promise<string | null>,
    queueDeletion?: (objectKey: string) => Promise<void>,
  ): Promise<ReportPdfRetentionResult> {
    const now = this.now();
    const cutoff = new Date(now.getTime() - REPORT_PDF_ACCESS_TTL_SECONDS * 1000);
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

        const expiresAt = await publishedExpiry(folder.name + "/" + reportObject.name);

        // Only unpublished objects age out by their storage creation time.
        if (expiresAt === null
          ? !(Date.parse(reportObject.created_at ?? "") <= cutoff.getTime())
          : !(Date.parse(expiresAt) <= now.getTime())) continue;

        const objectKey = `${folder.name}/${reportObject.name}`;
        // Lifecycle callers queue durably, then delete through a leased worker.
        if (queueDeletion) {
          await queueDeletion(objectKey);
          continue;
        }
        const { error } = await bucket.remove([objectKey]);

        if (error) {
          warnings.push(
            "Report artifact cleanup is pending retry.",
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

  private getClient(signal?: AbortSignal): ReportStorageClient {
    const client =
      this.client ??
      createClient(
        this.supabaseUrl ?? getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
        this.serviceRoleKey ?? getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
        {
          ...(signal ? { global: { fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
            const response = await fetch(url, { ...init, signal });
            if (!response.ok) throw new ProviderError(response.status, response.headers.get("retry-after"), await response.clone().json().catch(() => null));
            return response;
          } } } : {}),
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      );

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

function formatStorageError(error: StorageError, bucketName: string): string {
  if (/bucket not found/i.test(error.message)) {
    return `${error.message}. Create the private Supabase Storage bucket "${bucketName}" before generating reports.`;
  }

  return error.message;
}

export function getReportPdfObjectKey(sessionId: string, reportVersion: number): string {
  const normalizedSessionId = normalizeSessionId(sessionId);

  if (!Number.isSafeInteger(reportVersion) || reportVersion < 1) throw new Error("Invalid report version.");
  return `${normalizedSessionId}/${reportVersion}.pdf`;
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

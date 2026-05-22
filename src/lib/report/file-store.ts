import { randomUUID } from "node:crypto";

import type { PdfTokenRecord } from "@/lib/report/types";

const DEFAULT_TOKEN_TTL_MS = 15 * 60 * 1000;

export interface PdfFileStoreOptions {
  tokenTtlMs?: number;
  now?: () => Date;
  tokenFactory?: () => string;
}

export class PdfFileStore {
  private readonly records = new Map<string, PdfTokenRecord>();
  private readonly tokenTtlMs: number;
  private readonly now: () => Date;
  private readonly tokenFactory: () => string;

  constructor(options: PdfFileStoreOptions = {}) {
    this.tokenTtlMs = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
    this.now = options.now ?? (() => new Date());
    this.tokenFactory = options.tokenFactory ?? randomUUID;
  }

  registerPdf(sessionId: string, filePath: string): PdfTokenRecord {
    if (!sessionId.trim()) {
      throw new Error("Session id is required to register a PDF.");
    }

    if (!filePath.trim()) {
      throw new Error("File path is required to register a PDF.");
    }

    const createdAt = this.now();
    const token = this.tokenFactory();
    const record: PdfTokenRecord = {
      token,
      sessionId,
      filePath,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.tokenTtlMs).toISOString(),
    };

    this.records.set(token, record);

    return record;
  }

  getPdf(token: string, sessionId: string): PdfTokenRecord | null {
    const record = this.records.get(token);

    if (!record) {
      return null;
    }

    if (this.isExpired(record)) {
      this.records.delete(token);
      return null;
    }

    if (record.sessionId !== sessionId) {
      return null;
    }

    return record;
  }

  revokeToken(token: string): boolean {
    return this.records.delete(token);
  }

  clearExpired(): number {
    let clearedCount = 0;

    this.records.forEach((record, token) => {
      if (this.isExpired(record)) {
        this.records.delete(token);
        clearedCount += 1;
      }
    });

    return clearedCount;
  }

  private isExpired(record: PdfTokenRecord): boolean {
    return Date.parse(record.expiresAt) <= this.now().getTime();
  }
}

export const pdfFileStore = new PdfFileStore();

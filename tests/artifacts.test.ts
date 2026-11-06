import { describe, expect, it, vi } from "vitest";
import { PdfFileStore } from "@/lib/report/file-store";
import { renderReportPdf } from "@/lib/report/pdf-renderer";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
describe("Private versioned PDF objects", () => {
  function fixture() {
    const objects = new Map<string, Blob>();
    const bucket = {
      upload: vi.fn(async (key: string, bytes: Buffer) => {
        if (objects.has(key)) return { error: { statusCode: 409, message: "Already exists" } };
        objects.set(key, new Blob([new Uint8Array(bytes)]));
        return { error: null };
      }),
      download: vi.fn(async (key: string) => ({ data: objects.get(key) ?? null, error: null })),
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    };
    const options = { now: () => new Date("2026-11-05T01:00:00Z"), client: { storage: { from: () => bucket } } };
    return { newStore: () => new PdfFileStore(options), bucket };
  }

  it("reads independent versions from a separate store instance without listing or minting URLs", async () => {
    const { newStore, bucket } = fixture();
    const writer = newStore();
    const generatedAt = "2026-11-04T00:50:00Z";
    const first = await renderReportPdf({
      sessionId: id, generatedAt,
      studentProfile: { sessionId: id, interests: [], strengths: [], concerns: [],
        financialStatus: "unknown", approvedAt: generatedAt },
      rankedRecommendations: { sessionId: id, generatedAt, recommendations: [] },
      academicEvidence: { availableDocuments: [], missingDocuments: [], completenessNote: "Fixture" },
      auditTrail: [],
    });
    expect(Buffer.isBuffer(first)).toBe(true);
    expect(first.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await writer.uploadReportPdf(id, first, 1)).toEqual({ byteLength: first.length });
    await writer.uploadReportPdf(id, Buffer.from("%PDF-version-2"), 2);
    const reader = newStore();
    expect(Buffer.from(await (await reader.downloadReportPdf(id, 1)).arrayBuffer())).toEqual(first);
    expect(await (await reader.downloadReportPdf(id, 2)).text()).toBe("%PDF-version-2");
    expect(bucket.upload).toHaveBeenCalledWith(`${id}/2.pdf`, expect.any(Buffer), {
      contentType: "application/pdf", upsert: false,
    });
    expect(bucket.list).not.toHaveBeenCalled();
  });

  it("rejects replacement of an existing version and leaves its bytes intact", async () => {
    const { newStore } = fixture();
    const writer = newStore();
    await writer.uploadReportPdf(id, Buffer.from("%PDF-original"), 1);
    await expect(writer.uploadReportPdf(id, Buffer.from("%PDF-replacement"), 1)).rejects.toMatchObject({ status: 409 });
    expect(await (await newStore().downloadReportPdf(id, 1)).text()).toBe("%PDF-original");
  });

  it("retains published PDFs until their own expiry and ages out orphan uploads by creation", async () => {
    const { newStore, bucket } = fixture();
    bucket.list.mockResolvedValueOnce({ data: [{ name: id }], error: null })
      .mockResolvedValueOnce({ data: [
        { name: "1.pdf", created_at: "2026-11-04T00:50:00Z" },
        { name: "2.pdf", created_at: "2026-11-04T00:55:00Z" },
        { name: "3.pdf", created_at: "2026-11-04T00:56:00Z" },
      ], error: null });
    const expiries = new Map([
      [`${id}/1.pdf`, "2026-11-05T01:01:00Z"],
      [`${id}/2.pdf`, "2026-11-05T01:00:00Z"],
    ]);
    expect(await newStore().purgeExpiredReportPdfs(async (key) => expiries.get(key) ?? null))
      .toMatchObject({ scannedCount: 3, deletedCount: 2, warnings: [] });
    expect(bucket.remove.mock.calls).toEqual([[[`${id}/2.pdf`]], [[`${id}/3.pdf`]]]);
  });

  it("deletes all PDF versions on explicit termination", async () => {
    const { newStore, bucket } = fixture();
    bucket.list.mockResolvedValue({ data: [{ name: `${id}.pdf` }, { name: "2.pdf" }], error: null });
    await newStore().deleteReportPdf(id);
    expect(bucket.remove).toHaveBeenCalledWith([`${id}/${id}.pdf`, `${id}/2.pdf`]);
  });
});

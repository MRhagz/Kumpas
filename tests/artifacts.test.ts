import { describe, expect, it, vi } from "vitest";
import { PdfFileStore } from "@/lib/report/file-store";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
describe("I03 report object delivery", () => {
  function fixture(updatedAt = "2026-11-04T00:00:00Z") {
    const download = vi.fn().mockResolvedValue({ data: new Blob(["%PDF-synthetic"]), error: null });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const bucket = {
      upload, download, list: vi.fn().mockResolvedValue({ data: [{ name: `${id}.pdf`, updated_at: updatedAt }], error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    };
    const store = new PdfFileStore({ now: () => new Date("2026-11-04T01:00:00Z"), client: { storage: { from: () => bucket } } });
    return { store, download, upload, bucket };
  }
  it("returns an authenticated application reference without minting a bearer storage URL", async () => {
    const { store, upload } = fixture();
    const result = await store.uploadReportPdf(id, Buffer.from("%PDF-synthetic"));
    expect(upload).toHaveBeenCalledOnce();
    expect(result.downloadUrl).toBe(`/api/reports/${id}?download=1`);
    expect(result.expiresAt).toBe("2026-11-05T01:00:00.000Z");
  });
  it("serves an unexpired private object after route authorization", async () => {
    const { store } = fixture();
    expect(await (await store.downloadReportPdf(id)).text()).toBe("%PDF-synthetic");
  });
  it("denies expired objects before requesting bytes", async () => {
    const { store, download } = fixture("2026-11-03T01:00:00Z");
    await expect(store.downloadReportPdf(id)).rejects.toThrow(/expired/);
    expect(download).not.toHaveBeenCalled();
  });
  it("stores a versioned PDF without overwriting and deletes all versions on termination", async () => {
    const { store, upload, bucket } = fixture();
    await store.uploadReportPdf(id, Buffer.from("%PDF-synthetic"), 2);
    expect(upload).toHaveBeenCalledWith(`${id}/2.pdf`, expect.any(Buffer), { contentType: "application/pdf", upsert: false });
    bucket.list.mockResolvedValue({ data: [{ name: `${id}.pdf`, updated_at: "2026-11-04T00:00:00Z" }, { name: "2.pdf", updated_at: "2026-11-04T00:00:00Z" }], error: null });
    await store.deleteReportPdf(id);
    expect(bucket.remove).toHaveBeenCalledWith([`${id}/${id}.pdf`, `${id}/2.pdf`]);
  });

});

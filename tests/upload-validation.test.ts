import { describe, expect, it } from "vitest";
import { readAcademicUpload, validateAcademicContent } from "@/lib/module2/academic-upload-validation";
import { MAX_ACADEMIC_FILE_BYTES, MAX_ACADEMIC_REQUEST_BYTES, academicFileSizeError } from "@/lib/academic-upload-policy";
import { imageFixture, pdfFixture, uploadRequest } from "./upload-fixtures";
import { readFileSync } from "node:fs";

describe("academic upload validation", () => {
  for (const docType of ["form_137", "ncae", "nat"]) {
    for (const format of ["jpeg", "png", "webp", "pdf"] as const) {
      it(`accepts decoded ${format} for ${docType}`, async () => {
        const buffer = format === "pdf" ? pdfFixture() : await imageFixture(format);
        const type = format === "pdf" ? "application/pdf" : `image/${format}`;
        const result = await readAcademicUpload(uploadRequest(buffer, type, docType));
        expect(result.mimeType).toBe(type);
        expect(result.docType).toBe(docType);
      });
    }
  }
  for (const size of [MAX_ACADEMIC_FILE_BYTES - 1, MAX_ACADEMIC_FILE_BYTES, MAX_ACADEMIC_FILE_BYTES + 1]) {
    it(`uses the same client/server boundary for ${size} bytes`, async () => {
      const buffer = pdfFixture(size);
      const result = readAcademicUpload(uploadRequest(buffer));
      if (size > MAX_ACADEMIC_FILE_BYTES) {
        expect(academicFileSizeError({ size })).toContain("10,000,000 bytes");
        await expect(result).rejects.toMatchObject({ status: 413 });
      } else {
        expect(academicFileSizeError({ size })).toBeNull();
        expect((await result).buffer.length).toBe(size);
      }
    });
  }
  it("derives MIME from content when the browser provides none", async () => {
    expect(await validateAcademicContent(await imageFixture("png"), "")).toBe("image/png");
  });
  it("rejects password-protected PDFs before extraction with an actionable error", async () => {
    const buffer = readFileSync(new URL("./fixtures/upload-encrypted.pdf", import.meta.url));
    await expect(readAcademicUpload(uploadRequest(buffer))).rejects.toMatchObject({ status: 415, message: expect.stringContaining("unencrypted PDF") });
  });
  it("rejects forged MIME, renamed executables, GIF, empty and corrupt files", async () => {
    const invalid = [
      uploadRequest(Buffer.from("MZ executable pretending to be a PDF")),
      uploadRequest(await imageFixture("png"), "image/jpeg"),
      uploadRequest(await imageFixture("gif"), "image/gif"),
      uploadRequest(Buffer.alloc(0)),
      uploadRequest(Buffer.from("%PDF-1.7\ncorrupt\n%%EOF")),
      uploadRequest(pdfFixture().subarray(0, 100)),
      uploadRequest((await imageFixture("png")).subarray(0, 50), "image/png"),
      uploadRequest((await imageFixture("jpeg")).subarray(0, 100), "image/jpeg"),
      uploadRequest((await imageFixture("webp")).subarray(0, 30), "image/webp"),
    ];
    for (const request of invalid) await expect(readAcademicUpload(request)).rejects.toHaveProperty("status");
  });
  it("rejects duplicate multipart fields and non-file strings", async () => {
    for (const fields of [["file", "a"], ["docType", "nat"]]) {
      const request = uploadRequest(pdfFixture());
      const form = await request.formData();
      form.append(fields[0], fields[1]);
      await expect(readAcademicUpload(new Request(request.url, { method: "POST", body: form }))).rejects.toMatchObject({ status: 400 });
    }
  });
  it("rejects a large Content-Length before reading bytes", async () => {
    const request = new Request("http://localhost/upload", { method: "POST", headers: {
      "content-length": String(MAX_ACADEMIC_REQUEST_BYTES + 1), "content-type": "multipart/form-data; boundary=x",
    }, body: "x" });
    await expect(readAcademicUpload(request)).rejects.toMatchObject({ status: 413 });
    expect(request.bodyUsed).toBe(false);
  });
  it("bounds chunked bodies without trusting Content-Length", async () => {
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(MAX_ACADEMIC_REQUEST_BYTES + 1)); controller.close();
    } });
    const request = new Request("http://localhost/upload", {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": "1" },
      body: stream, duplex: "half",
    } as RequestInit);
    await expect(readAcademicUpload(request)).rejects.toMatchObject({ status: 413 });
  });
  it("maps parser/runtime size failures to 413, malformed multipart to 400", async () => {
    const stream = new ReadableStream({ start(controller) {
      controller.error(new TypeError("Cannot parse", { cause: new Error("Body exceeded 10 MB limit") }));
    } });
    const request = new Request("http://localhost/upload", { method: "POST", body: stream,
      headers: { "content-type": "multipart/form-data; boundary=x" }, duplex: "half" } as RequestInit);
    await expect(readAcademicUpload(request)).rejects.toMatchObject({ status: 413 });
    const malformed = new Request("http://localhost/upload", { method: "POST", body: "--broken", headers: { "content-type": "multipart/form-data; boundary=x" } });
    await expect(readAcademicUpload(malformed)).rejects.toMatchObject({ status: 400 });
  });
});

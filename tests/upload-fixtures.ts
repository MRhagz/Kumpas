import sharp from "sharp";

export function pdfFixture(targetSize?: number): Buffer {
  const build = (padding: number) => {
    const stream = " ".repeat(padding);
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 20 20] /Resources << >> /Contents 4 0 R >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let text = "%PDF-1.7\n";
    const offsets = [0];
    for (const [index, object] of objects.entries()) {
      offsets.push(Buffer.byteLength(text));
      text += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xref = Buffer.byteLength(text);
    text += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
    text += `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(text);
  };
  if (!targetSize) return build(0);
  let padding = targetSize - build(0).length;
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = build(padding);
    if (result.length === targetSize) return result;
    padding += targetSize - result.length;
  }
  throw new Error("Could not produce the exact fixture size");
}

export async function imageFixture(format: "jpeg" | "png" | "webp" | "gif") {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).toFormat(format).toBuffer();
}

export function uploadRequest(buffer: Buffer, type = "application/pdf", docType = "form_137", replacement?: string) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(buffer)], "record.pdf", { type }));
  form.append("docType", docType);
  if (replacement) form.append("replaceDocumentId", replacement);
  return new Request("http://localhost/api/upload", { method: "POST", body: form });
}

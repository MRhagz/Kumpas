import sharp, { type OverlayOptions } from "sharp";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export async function createAcademicPdfTask(buffer: Buffer) {
  const { getDocument } = await import("academic-pdfjs/legacy/build/pdf.mjs");
  const packagePath = dirname(createRequire(import.meta.url).resolve("academic-pdfjs/package.json"));
  return getDocument({
    data: new Uint8Array(buffer), stopAtErrors: true,
    standardFontDataUrl: join(packagePath, "standard_fonts").replaceAll("\\", "/") + "/",
    cMapUrl: join(packagePath, "cmaps").replaceAll("\\", "/") + "/",
    wasmUrl: join(packagePath, "wasm").replaceAll("\\", "/") + "/",
  });
}

// Keep every page in one image for the existing image-only redaction/storage path.
// Bound decoded pixels, rather than dropping pages or sending the raw PDF externally.
export async function renderAcademicPdf(buffer: Buffer): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const task = await createAcademicPdfTask(buffer);
  try {
    const pdf = await task.promise;
    const columns = Math.ceil(Math.sqrt(pdf.numPages));
    const rows = Math.ceil(pdf.numPages / columns);
    let pageWidth = 0, pageHeight = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      pageWidth = Math.max(pageWidth, viewport.width);
      pageHeight = Math.max(pageHeight, viewport.height);
      page.cleanup();
    }
    const scale = Math.min(2, Math.sqrt(16_000_000 / (pageWidth * columns * pageHeight * rows))) * 0.99;
    const cellWidth = Math.max(1, Math.ceil(pageWidth * scale));
    const cellHeight = Math.max(1, Math.ceil(pageHeight * scale));
    const images: OverlayOptions[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
      images.push({ input: canvas.toBuffer("image/png"), left: ((number - 1) % columns) * cellWidth, top: Math.floor((number - 1) / columns) * cellHeight });
      page.cleanup();
    }
    return await sharp({ create: { width: columns * cellWidth, height: rows * cellHeight, channels: 3, background: "white" } })
      .composite(images).jpeg({ quality: 90 }).toBuffer();
  } catch {
    throw new Error("Could not render all PDF pages. Export a readable PDF or upload an image and retry.");
  } finally {
    await task.destroy();
  }
}

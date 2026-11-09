import { join } from "node:path";

/** Read rendered text, including the PDF's embedded-font Unicode mapping. */
export async function reportPdfText(pdf: Buffer): Promise<string> {
  const { getDocument } = await import("academic-pdfjs/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(pdf), standardFontDataUrl: join(process.cwd(), "node_modules/academic-pdfjs/standard_fonts") + "/" });
  try {
    const document = await task.promise;
    const pages: string[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const { items } = await page.getTextContent();
      pages.push(items.flatMap((item) => "str" in item ? [item.str] : []).join(" "));
      page.cleanup();
    }
    return pages.join(" ");
  } finally { await task.destroy(); }
}

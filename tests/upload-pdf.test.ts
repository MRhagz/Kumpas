import { expect, it } from "vitest";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { renderAcademicPdf } from "@/lib/module2/academic-pdf-renderer";

it("renders all PDF pages in order into the image passed to redaction", async () => {
  // Synthetic pages contain a red square on page 1 and a blue square on page 2.
  const pdf = readFileSync(new URL("./fixtures/upload-two-pages.pdf", import.meta.url));
  const result = await renderAcademicPdf(pdf);
  const image = sharp(result);
  const metadata = await image.metadata();
  expect(metadata.format).toBe("jpeg");
  const left = await sharp(await image.clone().extract({ left: 10, top: 10, width: 5, height: 5 }).toBuffer()).stats();
  const right = await sharp(await image.clone().extract({ left: 50, top: 10, width: 5, height: 5 }).toBuffer()).stats();
  expect(left.channels[0].mean).toBeGreaterThan(200); expect(left.channels[2].mean).toBeLessThan(40);
  expect(right.channels[2].mean).toBeGreaterThan(200); expect(right.channels[0].mean).toBeLessThan(40);
});

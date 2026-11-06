// Maintainer utility only. Never regenerate a corpus after viewing scored output.
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";

const root = new URL("../../tests/fixtures/extraction/", import.meta.url);
await mkdir(root, { recursive: true });
const conditions = ["clean", "low-quality", "missing-field", "non-standard", "mixed-quality"];
const formats = ["png", "jpeg", "pdf", "webp"];
const fixtures = [];

function pdf(pages) {
  const objects = [Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"), Buffer.alloc(0)];
  const ids = [];
  for (const { bytes, width, height } of pages) {
    const imageId = objects.length + 1;
    objects.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`), bytes, Buffer.from("\nendstream")]));
    const stream = "q 562 0 0 381 25 385 cm /Im0 Do Q";
    objects.push(Buffer.from(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
    ids.push(objects.length + 1);
    objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${imageId + 1} 0 R >>`));
  }
  objects[1] = Buffer.from(`<< /Type /Pages /Kids [${ids.map(id => `${id} 0 R`).join(" ")}] /Count ${ids.length} >>`);
  const chunks = [Buffer.from("%PDF-1.7\n")];
  let length = chunks[0].length;
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]);
    chunks.push(chunk); length += chunk.length;
  }
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  chunks.push(Buffer.from(xref + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

for (const category of ["form_137", "ncae", "nat"]) {
  for (const [c, condition] of conditions.entries()) for (let sample = 0; sample < 2; sample++) {
    const index = fixtures.length;
    const format = formats[index % formats.length];
    const id = `${category}-${condition}-${sample + 1}`;
    const missing = condition === "missing-field";
    const grade = 80 + c + sample;
    const year = sample ? "2025-2026" : "2024-2025";
    const level = sample ? "Grade 11" : "Grade 10";
    const score = c === 0 && sample === 0 ? 0 : 60 + c * 3 + sample;
    let expected, body;
    if (category === "form_137") {
      expected = { subjects: [{ name: "Mathematics", grade, year, grade_level: level },
        { name: "Science", grade: missing ? null : grade + 4, year, grade_level: level }],
        gwa: missing ? null : grade + 2, school_year: year };
      body = [`School year: ${year}`, `Level: ${level}`, "Subject | Quarter 1 | Quarter 2 | FINAL RATING",
        `Mathematics | 70 | 75 | ${grade}`, `Science | 71 | 76 | ${missing ? "" : grade + 4}`,
        ...(missing ? [] : [`Printed overall GWA: ${grade + 2}`])];
    } else if (category === "ncae") {
      expected = { strand_scores: { "Scientific Ability": score, "Mathematical Ability": missing ? null : score + 8 },
        overall_percentile: missing ? null : score + 4, recommended_strand: missing ? null : "STEM" };
      body = [`Scientific Ability: ${score}`, `Mathematical Ability: ${missing ? "" : score + 8}`,
        ...(missing ? [] : [`Overall percentile: ${score + 4}`, "Printed recommended strand: STEM"])];
    } else {
      expected = { subjects: { Mathematics: score, Science: missing ? null : score + 8 },
        composite_score: missing ? null : score + 4, mastery_level: missing ? null : "Average Mastery" };
      body = [`Mathematics: ${score}`, `Science: ${missing ? "" : score + 8}`,
        ...(missing ? [] : [`Printed composite score: ${score + 4}`, "Mastery level: Average Mastery"])];
    }
    const heading = { form_137: "FORM 137 - Learner Permanent Record", ncae: "NATIONAL CAREER ASSESSMENT EXAMINATION (NCAE)", nat: "NATIONAL ACHIEVEMENT TEST (NAT)" }[category];
    if (condition === "non-standard") body = [...body].reverse();
    const lines = [heading, "SYNTHETIC TEST RECORD - NOT A REAL STUDENT", `Name: Synthetic Learner ${index + 1}`,
      "Birthdate: 2010-01-01", `ID: TEST-ONLY-${String(index + 1).padStart(3, "0")}`, ...body];
    let bytes;
    const renderImage = async (pageLines, targetFormat) => {
      const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="950"><rect width="100%" height="100%" fill="#fff"/>${pageLines.map((line, i) => `<text x="45" y="${55 + i * 65}" font-size="${i ? 27 : 30}" font-family="Arial" fill="${condition === "mixed-quality" && i % 2 ? "#888" : "#111"}">${escape(line)}</text>`).join("")}</svg>`;
      let image = sharp(Buffer.from(svg));
      if (condition === "low-quality") image = image.resize(840, 570).blur(0.6).rotate(1, { background: "#dedede" });
      return image.toFormat(targetFormat, { quality: condition === "low-quality" ? 50 : 90 }).toBuffer();
    };
    if (format === "pdf") {
      const pageLines = condition === "mixed-quality" ? [lines.slice(0, 6), [heading, ...lines.slice(6)]] : [lines];
      const pages = [];
      for (const page of pageLines) {
        const image = await renderImage(page, "jpeg");
        const { width, height } = await sharp(image).metadata();
        pages.push({ bytes: image, width, height });
      }
      bytes = pdf(pages);
    } else bytes = await renderImage(lines, format);
    const file = `${id}.${format === "jpeg" ? "jpg" : format}`;
    await writeFile(new URL(file, root), bytes);
    fixtures.push({ id, category, condition, format, mimeType: format === "pdf" ? "application/pdf" : `image/${format}`,
      file, sha256: createHash("sha256").update(bytes).digest("hex"), pages: format === "pdf" && condition === "mixed-quality" ? 2 : 1,
      sourceLines: lines, expected: { type: category, data: expected } });
  }
}
await writeFile(new URL("manifest.json", root), JSON.stringify({ version: "sw28-v1", synthetic: true,
  independentGroundTruthReview: "pending", fixtures }, null, 2) + "\n");
// A prepared interview-summary photograph exercises the separate notes route.
// It is a contract fixture, outside the academic S09 denominator.
const notes = { careerGoal: "<p>Undecided</p>", interests: "<p>Mathematics and drawing</p>",
  financial: "<p>Scholarship needed</p>", concerns: "<p></p>", impression: "<p>Explore engineering</p>" };
const sourceLines = ["SYNTHETIC PREPARED COUNSELOR SUMMARY", "Name: Synthetic Learner - ID: TEST-NOTES-ONLY",
  "Career goal: Undecided", "Interests: Mathematics and drawing", "Financial: Scholarship needed",
  "Concerns:", "Impression: Explore engineering"];
const notesSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="950"><rect width="100%" height="100%" fill="white"/>${sourceLines.map((line, i) => `<text x="50" y="${70 + i * 85}" font-family="Arial" font-size="30">${line}</text>`).join("")}</svg>`;
const photo = await sharp(Buffer.from(notesSvg)).rotate(2, { background: "#ddd" }).jpeg({ quality: 85 }).toBuffer();
await writeFile(new URL("notes-approved.jpg", root), photo);
await writeFile(new URL("notes-approved.json", root), JSON.stringify({ file: "notes-approved.jpg", mimeType: "image/jpeg",
  sha256: createHash("sha256").update(photo).digest("hex"), sourceLines, expected: notes }, null, 2) + "\n");
console.log(`Wrote ${fixtures.length} synthetic fixtures; independent answer-key review remains pending.`);

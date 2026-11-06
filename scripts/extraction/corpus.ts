import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { ExtractedAcademicData } from "../../src/types";

export const corpusRoot = new URL("../../tests/fixtures/extraction/", import.meta.url);
export const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export interface Fixture {
  id: string; category: "form_137" | "ncae" | "nat"; condition: string;
  format: string; mimeType: string; file: string; sha256: string; pages: number;
  sourceLines: string[]; expected: ExtractedAcademicData;
}

export function loadCorpus() {
  const bytes = readFileSync(new URL("manifest.json", corpusRoot));
  const manifest = JSON.parse(bytes.toString()) as { version: string; synthetic: boolean;
    independentGroundTruthReview: string; fixtures: Fixture[] };
  if (!manifest.synthetic || manifest.fixtures.length !== 30) throw new Error("Expected frozen 30-document synthetic corpus");
  const conditions = ["clean", "low-quality", "missing-field", "non-standard", "mixed-quality"];
  const ids = new Set<string>();
  const formats = new Set<string>();
  for (const fixture of manifest.fixtures) {
    if (ids.has(fixture.id) || !/^[a-z0-9_-]+\.(png|jpg|webp|pdf)$/.test(fixture.file)) throw new Error("Invalid fixture identity");
    ids.add(fixture.id);
    if (sha256(readFileSync(new URL(fixture.file, corpusRoot))) !== fixture.sha256) throw new Error("Fixture hash mismatch");
    if (fixture.expected.type !== fixture.category || !conditions.includes(fixture.condition)) throw new Error("Invalid fixture stratum");
    formats.add(fixture.format);
  }
  for (const category of ["form_137", "ncae", "nat"]) for (const condition of conditions) {
    if (manifest.fixtures.filter(f => f.category === category && f.condition === condition).length !== 2) throw new Error("Incomplete fixture matrix");
  }
  if (["png", "jpeg", "webp", "pdf"].some(format => !formats.has(format))) throw new Error("Incomplete format coverage");
  return { ...manifest, manifestSha256: sha256(bytes) };
}

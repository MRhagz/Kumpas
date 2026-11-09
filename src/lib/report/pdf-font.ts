import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { create, type Font } from "fontkit";

export type PdfFontWeight = "regular" | "bold";
type AddObject = (body: string | Buffer) => number;

const fonts = new Map<PdfFontWeight, { bytes: Buffer; metrics: Font }>();

/** Embed the same TrueType font used to measure each character's advance. */
export class ReportPdfFont {
  private readonly bytes: Buffer;
  private readonly metrics: Font;
  private readonly characters = new Map<string, { cid: number; glyph: number; width: number }>();

  constructor(weight: PdfFontWeight) {
    let font = fonts.get(weight);
    if (!font) {
      const bytes = readFileSync(join(process.cwd(), "node_modules/academic-pdfjs/standard_fonts", `LiberationSans-${weight === "bold" ? "Bold" : "Regular"}.ttf`));
      font = { bytes, metrics: create(bytes) as Font };
      fonts.set(weight, font);
    }
    this.bytes = font.bytes;
    this.metrics = font.metrics;
  }

  width(value: string, size: number): number {
    return Array.from(value).reduce((sum, character) => sum + this.character(character).width, 0) * size / 1000;
  }

  encode(value: string): string {
    return Array.from(value).map((character) => hex(this.character(character).cid)).join("");
  }

  private character(value: string) {
    let entry = this.characters.get(value);
    if (!entry) {
      const glyph = this.metrics.glyphForCodePoint(value.codePointAt(0)!);
      entry = { cid: this.characters.size + 1, glyph: glyph.id, width: this.scale(glyph.advanceWidth) };
      this.characters.set(value, entry);
    }
    return entry;
  }

  private scale(value: number): number {
    return Math.round(value * 1000 / this.metrics.unitsPerEm * 1000) / 1000;
  }

  embed(add: AddObject): number {
    const font = this.metrics;
    const file = add(pdfStream(this.bytes, `/Length1 ${this.bytes.length}`, true));
    const bbox = [font.bbox.minX, font.bbox.minY, font.bbox.maxX, font.bbox.maxY].map((value) => this.scale(value));
    const descriptor = add(`<< /Type /FontDescriptor /FontName /${font.postscriptName} /Flags 32 /FontBBox [${bbox.join(" ")}] /ItalicAngle 0 /Ascent ${this.scale(font.ascent)} /Descent ${this.scale(font.descent)} /CapHeight ${this.scale(font.capHeight)} /StemV 80 /FontFile2 ${file} 0 R >>`);
    const mapping = Buffer.alloc((this.characters.size + 1) * 2);
    const widths: string[] = [];
    const unicode: string[] = [];
    for (const [character, { cid, glyph, width }] of this.characters) {
      mapping.writeUInt16BE(glyph, cid * 2);
      widths.push(`${cid} [${width}]`);
      unicode.push(`<${hex(cid)}> <${Buffer.from(character, "utf16le").swap16().toString("hex")} >`);
    }
    const glyphMap = add(pdfStream(mapping, "", true));
    const descendant = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${font.postscriptName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /CIDToGIDMap ${glyphMap} 0 R /W [${widths.join(" ")}] >>`);
    const groups: string[] = [];
    for (let offset = 0; offset < unicode.length; offset += 100) {
      const group = unicode.slice(offset, offset + 100);
      groups.push(`${group.length} beginbfchar\n${group.join("\n")}\nendbfchar`);
    }
    const cmap = add(pdfStream(Buffer.from(`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /KumpasUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n${groups.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`)));
    return add(`<< /Type /Font /Subtype /Type0 /BaseFont /${font.postscriptName} /Encoding /Identity-H /DescendantFonts [${descendant} 0 R] /ToUnicode ${cmap} 0 R >>`);
  }
}

export function pdfStream(bytes: Buffer, dictionary = "", compress = false): Buffer {
  const data = compress ? deflateSync(bytes) : bytes;
  return Buffer.concat([Buffer.from(`<< /Length ${data.length} ${dictionary}${compress ? " /Filter /FlateDecode" : ""} >>\nstream\n`), data, Buffer.from("\nendstream")]);
}

function hex(value: number): string {
  return value.toString(16).padStart(4, "0");
}

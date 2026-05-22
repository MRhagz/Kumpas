import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatReasoningSummary } from "@/lib/report/reasoning-formatter";
import type {
  RankedRecommendation,
  RecommendationSource,
  ReportPayload,
} from "@/lib/report/types";

export interface PdfRenderResult {
  filePath: string;
  byteLength: number;
}

export interface PdfLayoutRendererOptions {
  outputDir?: string;
  fileName?: string;
}

type Rgb = [number, number, number];

interface PdfPage {
  commands: string[];
}

interface TextOptions {
  color?: Rgb;
  font?: "regular" | "bold";
  size?: number;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 38;
const MARGIN_BOTTOM = 38;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const INK: Rgb = [0.067, 0.094, 0.153];
const MUTED: Rgb = [0.42, 0.447, 0.502];
const LINE: Rgb = [0.898, 0.906, 0.922];
const PANEL: Rgb = [0.976, 0.98, 0.988];
const SAGE: Rgb = [0.42, 0.561, 0.443];
const SAGE_DARK: Rgb = [0.263, 0.376, 0.357];
const AMBER: Rgb = [0.706, 0.325, 0.035];
const RED: Rgb = [0.72, 0.11, 0.11];

export async function renderReportPdf(
  payload: ReportPayload,
  options: PdfLayoutRendererOptions = {},
): Promise<PdfRenderResult> {
  const outputDir = options.outputDir ?? tmpdir();
  const fileName = options.fileName ?? `kumpas-report-${payload.sessionId}.pdf`;
  const filePath = join(outputDir, fileName);
  const pdfBuffer = buildReportPdf(payload);

  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, pdfBuffer);

  return {
    filePath,
    byteLength: pdfBuffer.byteLength,
  };
}

export function buildReportPdf(payload: ReportPayload): Buffer {
  const builder = new StyledReportPdf(payload);
  return createPdfDocument(builder.render());
}

class StyledReportPdf {
  private pages: PdfPage[] = [];
  private currentPage!: PdfPage;
  private y = 0;
  private pageNumber = 0;

  constructor(private readonly payload: ReportPayload) {}

  render(): PdfPage[] {
    this.addPage();
    this.renderCoverHeader();
    this.renderStudentProfile();
    this.renderRecommendations();
    this.renderFooter();

    return this.pages;
  }

  private addPage(): void {
    this.pageNumber += 1;
    this.currentPage = { commands: [] };
    this.pages.push(this.currentPage);
    this.y = PAGE_HEIGHT - 38;
    this.drawRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, [1, 1, 1]);

    if (this.pageNumber > 1) {
      this.drawText("Kumpas Career Recommendation Report", MARGIN_X, this.y, {
        color: MUTED,
        font: "bold",
        size: 9,
      });
      this.drawText(`Page ${this.pageNumber}`, PAGE_WIDTH - MARGIN_X - 42, this.y, {
        color: MUTED,
        font: "bold",
        size: 9,
      });
      this.y -= 20;
      this.drawLine(MARGIN_X, this.y, PAGE_WIDTH - MARGIN_X, this.y, LINE);
      this.y -= 24;
    }
  }

  private renderCoverHeader(): void {
    const profile = this.payload.studentProfile;
    const title =
      profile.targetCareer ??
      this.payload.rankedRecommendations.recommendations[0]?.careerPath ??
      "Career Recommendation";

    this.drawText("Kumpas · Career Recommendation Report", MARGIN_X, this.y, {
      color: MUTED,
      font: "bold",
      size: 9,
    });
    this.drawText(formatDate(this.payload.generatedAt), PAGE_WIDTH - MARGIN_X - 112, this.y, {
      color: MUTED,
      font: "bold",
      size: 9,
    });
    this.y -= 24;

    this.drawText(title, MARGIN_X, this.y, {
      color: INK,
      font: "bold",
      size: 25,
    });
    this.y -= 16;
    this.drawText(`Session ID: ${this.payload.sessionId}`, MARGIN_X, this.y, {
      color: MUTED,
      size: 9,
    });
    this.y -= 16;
    this.drawLine(MARGIN_X, this.y, PAGE_WIDTH - MARGIN_X, this.y, INK, 1.4);
    this.y -= 18;
  }

  private renderStudentProfile(): void {
    const profile = this.payload.studentProfile;
    const panelHeight = 92;

    this.ensureSpace(panelHeight + 16);
    this.drawSectionLabel("Student Profile");
    this.drawRoundedPanel(MARGIN_X, this.y - panelHeight, CONTENT_WIDTH, panelHeight, PANEL);

    const leftX = MARGIN_X + 16;
    const rightX = MARGIN_X + CONTENT_WIDTH / 2 + 8;
    const topY = this.y - 20;

    this.drawLabelValue("Student", profile.displayName ?? "Not specified", leftX, topY);
    this.drawLabelValue("Financial Status", profile.financialStatus, rightX, topY);
    this.drawLabelValue("Target Career", profile.targetCareer ?? "Not specified", leftX, topY - 28);
    this.drawLabelValue("Approved At", formatDate(profile.approvedAt), rightX, topY - 28);
    this.drawLabelValue("Interests", formatList(profile.interests), leftX, topY - 56, 58);
    this.drawLabelValue("Strengths", formatList(profile.strengths), rightX, topY - 56, 58);

    this.y -= panelHeight + 20;
  }

  private renderRecommendations(): void {
    this.drawSectionLabel("Ranked Career Recommendations");
    this.y -= 4;

    this.payload.rankedRecommendations.recommendations.forEach((recommendation) => {
      this.renderRecommendation(recommendation);
    });
  }

  private renderRecommendation(recommendation: RankedRecommendation): void {
    const minCardHeight = 342;
    this.ensureSpace(minCardHeight);

    const cardTop = this.y;
    this.drawRoundedPanel(MARGIN_X, cardTop - minCardHeight, CONTENT_WIDTH, minCardHeight, [1, 1, 1]);
    this.drawRect(MARGIN_X, cardTop - 46, CONTENT_WIDTH, 46, SAGE_DARK);

    this.drawText(`Recommendation ${recommendation.rank}`, MARGIN_X + 16, cardTop - 15, {
      color: [0.82, 0.92, 0.88],
      font: "bold",
      size: 7,
    });
    this.drawText(recommendation.careerPath, MARGIN_X + 16, cardTop - 31, {
      color: [1, 1, 1],
      font: "bold",
      size: 15,
    });
    this.drawStatusPill(recommendation.status, PAGE_WIDTH - MARGIN_X - 96, cardTop - 26);

    this.renderScoreCards(recommendation, cardTop - 64);

    const bodyTop = cardTop - 136;
    const leftX = MARGIN_X + 16;
    const rightX = MARGIN_X + 342;
    const leftWidth = 300;
    const rightWidth = 164;

    this.drawMiniHeading("Key Signals", leftX, bodyTop);
    const signalsEndY = this.drawBullets(
      recommendation.keySignals,
      leftX,
      bodyTop - 16,
      leftWidth,
      4,
    );

    const formattedReasoning = formatReasoningSummary(recommendation, { maxLength: 520 });
    this.drawMiniHeading("Reasoning Summary", leftX, signalsEndY - 10);
    const reasoningEndY = this.drawParagraph(
      formattedReasoning.summary,
      leftX,
      signalsEndY - 26,
      leftWidth,
      9,
      11,
    );

    if (formattedReasoning.concerns.length > 0) {
      this.drawRect(leftX, reasoningEndY - 52, leftWidth, 42, [1, 0.984, 0.922]);
      this.drawMiniHeading("Review Notes", leftX + 8, reasoningEndY - 22, AMBER);
      this.drawBullets(
        formattedReasoning.concerns,
        leftX + 8,
        reasoningEndY - 37,
        leftWidth - 16,
        2,
        AMBER,
      );
    }

    this.drawMiniHeading("Audit Trail", rightX, bodyTop);
    this.renderAuditTrailSources(recommendation.id, rightX, bodyTop - 16, rightWidth);

    this.y = cardTop - minCardHeight - 18;
  }

  private renderScoreCards(recommendation: RankedRecommendation, topY: number): void {
    const gap = 10;
    const cardWidth = (CONTENT_WIDTH - 32 - gap * 3) / 4;
    const x = MARGIN_X + 16;
    const cards = [
      ["Alignment", recommendation.alignmentScore],
      ["Aptitude", recommendation.aptitudeFit],
      ["Market", recommendation.marketDemand],
      ["Financial", recommendation.financialFeasibility],
    ] as const;

    cards.forEach(([label, value], index) => {
      const cardX = x + index * (cardWidth + gap);
      this.drawRect(cardX, topY - 54, cardWidth, 54, PANEL);
      this.drawLine(cardX, topY - 54, cardX + cardWidth, topY - 54, LINE);
      this.drawText(label, cardX + 8, topY - 15, {
        color: MUTED,
        font: "bold",
        size: 7,
      });
      this.drawText(formatPercent(value), cardX + 8, topY - 34, {
        color: INK,
        font: "bold",
        size: 16,
      });
      this.drawScoreBar(cardX + 8, topY - 45, cardWidth - 16, value);
    });
  }

  private renderAuditTrailSources(
    recommendationId: string,
    x: number,
    y: number,
    width: number,
  ): void {
    const auditTrail = this.payload.auditTrail.find(
      (entry) => entry.recommendationId === recommendationId,
    );
    const sources = auditTrail?.sources.slice(0, 2) ?? [];

    if (sources.length === 0) {
      this.drawSourceBox(
        {
          id: "source-unavailable",
          title: "Source unavailable",
          reference: "source-unavailable",
          acquisitionMethod: "unknown",
          ingestionTimestamp: new Date(0).toISOString(),
          relatedSignals: [],
        },
        x,
        y,
        width,
      );
      return;
    }

    let sourceY = y;
    sources.forEach((source) => {
      sourceY = this.drawSourceBox(source, x, sourceY, width) - 7;
    });
  }

  private drawSourceBox(source: RecommendationSource, x: number, y: number, width: number): number {
    const height = 64;
    this.drawRect(x, y - height, width, height, [0.992, 0.992, 0.992]);
    this.drawRect(x, y - height, 3, height, SAGE);
    this.drawLine(x, y - height, x + width, y - height, LINE);
    this.drawLine(x, y, x + width, y, LINE);
    this.drawText(truncateText(source.title, 24), x + 9, y - 14, {
      color: INK,
      font: "bold",
      size: 8,
    });
    this.drawText(truncateText(source.reference, 31), x + 9, y - 28, {
      color: MUTED,
      size: 7,
    });
    this.drawText(source.acquisitionMethod, x + 9, y - 42, {
      color: SAGE_DARK,
      font: "bold",
      size: 7,
    });
    this.drawText(formatDate(source.ingestionTimestamp), x + 9, y - 54, {
      color: MUTED,
      size: 6,
    });

    return y - height;
  }

  private renderFooter(): void {
    this.pages.forEach((page, index) => {
      page.commands.push(
        line(MARGIN_X, 28, PAGE_WIDTH - MARGIN_X, 28, LINE),
        text("Kumpas · Module 4 report rendering demo", MARGIN_X, 16, {
          color: MUTED,
          size: 7,
        }),
        text(`Page ${index + 1} of ${this.pages.length}`, PAGE_WIDTH - MARGIN_X - 50, 16, {
          color: MUTED,
          size: 7,
        }),
      );
    });
  }

  private drawLabelValue(
    label: string,
    value: string,
    x: number,
    y: number,
    maxChars = 44,
  ): void {
    this.drawText(label, x, y, {
      color: MUTED,
      font: "bold",
      size: 7,
    });
    this.drawText(truncateText(value, maxChars), x, y - 13, {
      color: INK,
      font: "bold",
      size: 9,
    });
  }

  private drawSectionLabel(label: string): void {
    this.drawText(label.toUpperCase(), MARGIN_X, this.y, {
      color: MUTED,
      font: "bold",
      size: 8,
    });
    this.y -= 14;
  }

  private drawMiniHeading(label: string, x: number, y: number, color: Rgb = MUTED): void {
    this.drawText(label.toUpperCase(), x, y, {
      color,
      font: "bold",
      size: 7,
    });
  }

  private drawBullets(
    values: string[],
    x: number,
    y: number,
    width: number,
    maxItems: number,
    color: Rgb = INK,
  ): number {
    let currentY = y;
    values.slice(0, maxItems).forEach((value) => {
      this.drawText("•", x, currentY, { color: SAGE, font: "bold", size: 8 });
      currentY = this.drawParagraph(value, x + 9, currentY, width - 9, 8, 10, color);
      currentY -= 3;
    });

    if (values.length === 0) {
      currentY = this.drawParagraph("None listed", x, currentY, width, 8, 10, MUTED);
    }

    return currentY;
  }

  private drawParagraph(
    value: string,
    x: number,
    y: number,
    width: number,
    size: number,
    lineHeight: number,
    color: Rgb = INK,
  ): number {
    const lines = wrapText(value, width, size);
    let currentY = y;

    lines.forEach((wrappedLine) => {
      this.drawText(wrappedLine, x, currentY, { color, size });
      currentY -= lineHeight;
    });

    return currentY;
  }

  private drawStatusPill(status: RankedRecommendation["status"], x: number, y: number): void {
    const color = status === "complete" ? SAGE : status === "degraded" ? AMBER : RED;
    this.drawRect(x, y - 14, 74, 18, color);
    this.drawText(status.toUpperCase(), x + 9, y - 8, {
      color: [1, 1, 1],
      font: "bold",
      size: 7,
    });
  }

  private drawScoreBar(x: number, y: number, width: number, value: number): void {
    this.drawRect(x, y, width, 5, [0.9, 0.91, 0.92]);
    this.drawRect(x, y, Math.max(0, Math.min(width, width * value)), 5, SAGE);
  }

  private drawRoundedPanel(x: number, y: number, width: number, height: number, color: Rgb): void {
    this.drawRect(x, y, width, height, color);
    this.drawLine(x, y, x + width, y, LINE);
    this.drawLine(x, y + height, x + width, y + height, LINE);
    this.drawLine(x, y, x, y + height, LINE);
    this.drawLine(x + width, y, x + width, y + height, LINE);
  }

  private drawRect(x: number, y: number, width: number, height: number, color: Rgb): void {
    this.currentPage.commands.push(rect(x, y, width, height, color));
  }

  private drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: Rgb,
    width = 0.8,
  ): void {
    this.currentPage.commands.push(line(x1, y1, x2, y2, color, width));
  }

  private drawText(value: string, x: number, y: number, options: TextOptions = {}): void {
    this.currentPage.commands.push(text(value, x, y, options));
  }

  private ensureSpace(requiredHeight: number): void {
    if (this.y - requiredHeight < MARGIN_BOTTOM) {
      this.addPage();
    }
  }
}

function createPdfDocument(pages: PdfPage[]): Buffer {
  const objects: string[] = [];
  const pageRefs = pages.map((_, index) => 5 + index * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  pages.forEach((page, index) => {
    const pageObjectNumber = 5 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const stream = page.commands.join("\n");

    objects[pageObjectNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber] =
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`;
  });

  const parts = ["%PDF-1.4\n"];
  const offsets = [0];

  for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
    offsets[objectNumber] = Buffer.byteLength(parts.join(""), "utf8");
    parts.push(`${objectNumber} 0 obj\n${objects[objectNumber]}\nendobj\n`);
  }

  const xrefOffset = Buffer.byteLength(parts.join(""), "utf8");
  parts.push(`xref\n0 ${objects.length}\n`);
  parts.push("0000000000 65535 f \n");

  for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
    parts.push(`${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`);
  }

  parts.push(
    "trailer\n",
    `<< /Size ${objects.length} /Root 1 0 R >>\n`,
    "startxref\n",
    `${xrefOffset}\n`,
    "%%EOF\n",
  );

  return Buffer.from(parts.join(""), "utf8");
}

function text(value: string, x: number, y: number, options: TextOptions = {}): string {
  const color = options.color ?? INK;
  const font = options.font === "bold" ? "F2" : "F1";
  const size = options.size ?? 10;

  return [
    "BT",
    `${rgb(color)} rg`,
    `/${font} ${size} Tf`,
    `${formatNumber(x)} ${formatNumber(y)} Td`,
    `(${escapePdfText(sanitizePdfText(value))}) Tj`,
    "ET",
  ].join("\n");
}

function rect(x: number, y: number, width: number, height: number, color: Rgb): string {
  return [
    "q",
    `${rgb(color)} rg`,
    `${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re`,
    "f",
    "Q",
  ].join("\n");
}

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: Rgb,
  width = 0.8,
): string {
  return [
    "q",
    `${rgb(color)} RG`,
    `${formatNumber(width)} w`,
    `${formatNumber(x1)} ${formatNumber(y1)} m`,
    `${formatNumber(x2)} ${formatNumber(y2)} l`,
    "S",
    "Q",
  ].join("\n");
}

function wrapText(value: string, width: number, size: number): string[] {
  const sanitized = sanitizePdfText(value);
  const maxChars = Math.max(12, Math.floor(width / (size * 0.52)));

  if (sanitized.length <= maxChars) {
    return [sanitized];
  }

  const lines: string[] = [];
  const words = sanitized.split(" ");
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxChars) {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function truncateText(value: string, maxLength: number): string {
  const sanitized = sanitizePdfText(value);

  if (sanitized.length <= maxLength) {
    return sanitized;
  }

  return `${sanitized.slice(0, maxLength - 3).trimEnd()}...`;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function sanitizePdfText(value: string): string {
  return value
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00B7/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
}

function rgb(color: Rgb): string {
  return color.map(formatNumber).join(" ");
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "None listed";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

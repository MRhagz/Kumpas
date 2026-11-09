import { formatReasoningSummary } from "@/lib/report/reasoning-formatter";
import { publicSourceUrl, sourceDate } from "./evidence-summary";
import { documentLabel } from "./reasoning-formatter";
import { reportContentMarker } from "./types";
import type {
  RankedRecommendation,
  ReportPayload,
} from "@/lib/report/types";

type Rgb = [number, number, number];

interface PdfPage {
  commands: string[];
}

interface TextOptions {
  color?: Rgb;
  font?: "regular" | "bold" | "serif";
  size?: number;
}

interface ReportParagraph extends TextOptions {
  value: string;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 38;
const MARGIN_BOTTOM = 38;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const SPACE_1 = 8;
const SPACE_3 = 24;
const BODY_SIZE = 12;
const DETAIL_SIZE = 11;
const SOURCE_SIZE = 10.5;
const SECTION_LABEL_HEIGHT = 16;
const OVERVIEW_TITLE_SIZES = [12, 11, 10, 9];
const INK: Rgb = [0.102, 0.102, 0.094];
const MUTED: Rgb = [0.349, 0.349, 0.314];
const LINE: Rgb = [0.867, 0.851, 0.816];
const PANEL: Rgb = [0.988, 0.976, 0.957];
const SAGE: Rgb = [0.216, 0.392, 0.263];
const SAGE_LIGHT: Rgb = [0.937, 0.957, 0.937];
const AMBER: Rgb = [0.502, 0.325, 0.039];
const RED: Rgb = [0.72, 0.11, 0.11];

export async function renderReportPdf(
  payload: ReportPayload,
): Promise<Buffer> {
  return buildReportPdf(payload);
}

export function buildReportPdf(payload: ReportPayload): Buffer {
  const builder = new StyledReportPdf(payload);
  return createPdfDocument(builder.render(), payload.studentSummary ? reportContentMarker(payload.reportVersion, payload.approvedProfileVersion) : "");
}

class StyledReportPdf {
  private pages: PdfPage[] = [];
  private currentPage!: PdfPage;
  private y = 0;

  constructor(private readonly payload: ReportPayload) {}

  render(): PdfPage[] {
    this.addPage();
    this.renderCoverHeader();
    this.renderStudentSummary();
    this.addPage();
    this.drawSectionLabel("Counselor detail");
    this.y -= 12;
    this.drawText("Evidence and scoring", MARGIN_X, this.y, { font: "serif", size: 23 });
    this.y -= 26;
    this.flowText(`Report version: ${this.payload.reportVersion ?? "unavailable"}. Approved profile version: ${this.payload.approvedProfileVersion ?? "unavailable"}.`);
    this.flowText(`Inputs approved: ${formatDate(this.payload.studentProfile.approvedAt)}. Confidential note text is not reproduced automatically.`);
    this.renderAcademicEvidence();
    this.renderRecommendationOverview();
    this.renderRecommendations();
    this.renderEvidenceReferences();
    this.renderFooter();

    return this.pages;
  }

  private addPage(): void {
    this.currentPage = { commands: [] };
    this.pages.push(this.currentPage);
    this.y = PAGE_HEIGHT - 38;
    this.drawRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, [1, 1, 1]);
  }

  private renderCoverHeader(): void {
    this.drawSectionLabel("Kumpas / AI-assisted counselor review");
    this.y -= 16;
    this.drawText("Career Guidance Report", MARGIN_X, this.y, { font: "serif", size: 29 });
    this.y -= 27;
    this.flowText(`Generated ${formatDate(this.payload.generatedAt)}. Report version: ${this.payload.reportVersion ?? "unavailable"}. Approved profile version: ${this.payload.approvedProfileVersion ?? "unavailable"}.`, DETAIL_SIZE, MUTED);
    this.flowText("Generated as Draft for counselor review. Current approval status is recorded separately.", DETAIL_SIZE, AMBER);
    this.y -= 4;
  }

  private renderStudentSummary(): void {
    this.drawSectionLabel("Student summary");
    const summary = this.payload.studentSummary;
    if (!summary) {
      this.flowText("Student summary unavailable for this report. Generate a current report and review it with your counselor.");
      return;
    }
    const scored = summary.options.filter((option) => option.rank !== null && option.alignmentScore !== null).length;
    const takeaway = scored === 0
      ? "Explore options before ranking them"
      : `${scored} scored ${scored === 1 ? "option" : "options"} to discuss`;
    this.flowPanel([
      { value: "AT A GLANCE", size: 10, color: SAGE, font: "bold" },
      { value: takeaway, size: 18, font: "serif" },
      { value: scored === 0
        ? "An overall score or rank is unavailable. Review the evidence gaps with the student before choosing a pathway."
        : "Review the scores, trade-offs and evidence gaps with the student before choosing a pathway." },
      ...(this.payload.academicEvidence.availableDocuments.length === 0
        ? [{ value: "No usable academic records were available.", size: DETAIL_SIZE }]
        : []),
    ], SAGE_LIGHT);
    summary.options.forEach((option, index) => {
      this.flowPanel([
        { value: option.careerPath, size: 14, font: "bold" },
        { value: option.rank === null || option.alignmentScore === null
          ? "Unscored option. No total or rank: partial evidence."
          : `Rank ${option.rank} | Alignment score: ${option.alignmentScore.toFixed(2)} out of 100`,
          size: DETAIL_SIZE, color: SAGE, font: "bold" },
        ...option.reasons.map((value) => ({ value })),
        ...option.considerations.map((value) => ({ value, size: DETAIL_SIZE, color: MUTED })),
      ], PANEL, index === 0 ? "Options to discuss" : undefined);
    });
    if (summary.limitations.length) {
      this.flowPanel(summary.limitations.map((limitation) => ({ value: `- ${limitation}` })), PANEL, "Evidence gaps to review");
    }
    if (summary.nextSteps.length) {
      this.flowPanel(summary.nextSteps.map((step, index) => ({ value: `${index + 1}. ${step}` })), PANEL, "Next steps");
    }
    this.ensureSpace(68);
    this.drawSectionLabel("How to read this report");
    this.flowText(summary.disclosure);
    this.flowText(summary.scope, DETAIL_SIZE, MUTED);
    this.flowText(summary.scoreExplanation, DETAIL_SIZE);
  }

  private renderAcademicEvidence(): void {
    this.ensureSpace(60);
    this.drawSectionLabel("Academic evidence completeness");
    const evidence = this.payload.academicEvidence;
    this.flowText(`Available documents: ${evidence.availableDocuments.map(documentLabel).join(", ") || "None"}.`);
    this.flowText(`Missing usable documents: ${evidence.missingDocuments.map(documentLabel).join(", ") || "None"}.`, BODY_SIZE, AMBER);
    for (const [document, status] of Object.entries(evidence.documentStatuses ?? {})) {
      this.flowText(`${documentLabel(document)}: ${status}.`, DETAIL_SIZE, MUTED);
    }
    this.flowText(evidence.completenessNote);
    this.flowText("Scores compare supported options; they are not probabilities of career success. Missing components remain unavailable and are not treated as zero.", DETAIL_SIZE, MUTED);
  }

  /** Flow full-width text line by line so long content can span pages. */
  private flowText(value: string, size = BODY_SIZE, color: Rgb = INK, font: TextOptions["font"] = "regular"): void {
    const lineHeight = Math.ceil(size * 1.4);
    const lines = wrapText(value, CONTENT_WIDTH, size);
    const height = lines.length * lineHeight + 6;
    if (height <= PAGE_HEIGHT - 38 - MARGIN_BOTTOM) this.ensureSpace(height);
    for (const wrapped of lines) {
      this.ensureSpace(lineHeight);
      this.drawText(wrapped, MARGIN_X, this.y, { size, color, font });
      this.y -= lineHeight;
    }
    this.y -= 6;
  }

  private flowPanel(paragraphs: ReportParagraph[], background: Rgb, sectionLabel?: string): void {
    const padding = 12;
    const gap = 3;
    const blocks = paragraphs.map(({ value, size = BODY_SIZE, ...options }) => ({
      lines: wrapText(value, CONTENT_WIDTH - padding * 2, size),
      lineHeight: Math.ceil(size * 1.3),
      options: { ...options, size },
    }));
    const height = padding * 2 + blocks.reduce((sum, block) => sum + block.lines.length * block.lineHeight, 0)
      + gap * (blocks.length - 1);

    const requiredHeight = height + (sectionLabel ? SECTION_LABEL_HEIGHT : 0);
    if (requiredHeight > PAGE_HEIGHT - 38 - MARGIN_BOTTOM) {
      if (sectionLabel) {
        this.ensureSpace(50);
        this.drawSectionLabel(sectionLabel);
      }
      for (const { value, size, color, font } of paragraphs) this.flowText(value, size, color, font);
      return;
    }

    this.ensureSpace(requiredHeight);
    if (sectionLabel) this.drawSectionLabel(sectionLabel);
    this.drawRoundedPanel(MARGIN_X, this.y - height, CONTENT_WIDTH, height, background);
    let top = this.y - padding;
    for (const { lines, lineHeight, options } of blocks) {
      for (const wrapped of lines) {
        this.drawText(wrapped, MARGIN_X + padding, top - options.size, options);
        top -= lineHeight;
      }
      top -= gap;
    }
    this.y -= height + 12;
  }

  private renderRecommendationOverview(): void {
    const recommendations = this.payload.rankedRecommendations.recommendations.filter((r) => r.rank !== null).slice(0, 3);
    if (recommendations.length === 0) return;
    const gap = SPACE_1;
    const cardWidth = (CONTENT_WIDTH - gap * 2) / 3;

    const maxTitleLines = 3;
    let chosenSize = OVERVIEW_TITLE_SIZES[OVERVIEW_TITLE_SIZES.length - 1];
    let perCardLines: number[] = [];
    for (const size of OVERVIEW_TITLE_SIZES) {
      const lines = recommendations.map(
        (r) => wrapText(r.careerPath, cardWidth - SPACE_1 * 2, size).length,
      );
      if (Math.max(...lines, 1) <= maxTitleLines) {
        chosenSize = size;
        perCardLines = lines;
        break;
      }
    }
    if (perCardLines.length === 0) {
      perCardLines = recommendations.map(
        (r) => wrapText(r.careerPath, cardWidth - SPACE_1 * 2, chosenSize).length,
      );
    }
    const titleLineHeight = Math.ceil(chosenSize * 1.25);
    const titleAreaLines = Math.min(maxTitleLines, Math.max(...perCardLines, 1));

    const rankRowHeight = 22;
    const titleAreaHeight = titleAreaLines * titleLineHeight;
    const scoreBlockHeight = 50;
    const bottomPad = 12;
    const panelHeight = rankRowHeight + titleAreaHeight + 14 + scoreBlockHeight + bottomPad;

    this.ensureSpace(panelHeight + SPACE_3 + SECTION_LABEL_HEIGHT);
    this.drawSectionLabel("Recommendation Overview");
    const cardTop = this.y;

    recommendations.forEach((recommendation, index) => {
      const x = MARGIN_X + index * (cardWidth + gap);
      this.drawRoundedPanel(x, cardTop - panelHeight, cardWidth, panelHeight, PANEL);
      this.drawText(`RANK ${recommendation.rank}`, x + SPACE_1, cardTop - 18, {
        color: SAGE,
        font: "bold",
        size: 9,
      });
      const overviewTitleLines = wrapText(
        recommendation.careerPath,
        cardWidth - SPACE_1 * 2,
        chosenSize,
      ).slice(0, maxTitleLines);
      const titleTop = cardTop - rankRowHeight - 4;
      overviewTitleLines.forEach((overviewLine, lineIndex) => {
        this.drawText(overviewLine, x + SPACE_1, titleTop - lineIndex * titleLineHeight, {
          color: INK,
          font: "bold",
          size: chosenSize,
        });
      });
      const scoreY = titleTop - titleAreaHeight - 18;
      this.drawText(formatScore(recommendation.alignmentScore), x + SPACE_1, scoreY, {
        color: SAGE,
        font: "bold",
        size: 18,
      });
      this.drawScoreBar(x + SPACE_1, scoreY - 12, cardWidth - SPACE_1 * 2, recommendation.alignmentScore);
      this.drawText(recommendation.status.toUpperCase(), x + SPACE_1, scoreY - 25, {
        color: statusColor(recommendation.status),
        font: "bold",
        size: 9,
      });
    });

    this.y -= panelHeight + SPACE_3;
  }

  private renderRecommendations(): void {
    this.ensureSpace(90);
    const partialOnly = this.payload.rankedRecommendations.recommendations.every((r) => r.rank === null);
    this.drawSectionLabel(partialOnly ? "Unscored Partial Comparisons" : "Ranked Career Recommendations");
    this.y -= 4;
    let partialHeadingShown = partialOnly;
    this.payload.rankedRecommendations.recommendations.forEach((recommendation) => {
      if (recommendation.rank === null && !partialHeadingShown) {
        this.ensureSpace(90);
        this.drawSectionLabel("Unscored Partial Comparisons");
        partialHeadingShown = true;
      }
      this.renderRecommendation(recommendation);
    });
  }

  private renderRecommendation(recommendation: RankedRecommendation): void {
    this.ensureSpace(70);
    this.flowText(`${recommendation.rank === null ? "Unscored partial comparison" : `Recommendation ${recommendation.rank}`}: ${recommendation.careerPath}`, 14, SAGE, "bold");
    this.flowText(`Status: ${recommendation.status}. Alignment: ${formatScore(recommendation.alignmentScore)}. Aptitude: ${formatScore(recommendation.aptitudeFit)}. Demand: ${formatScore(recommendation.marketDemand)}. Feasibility: ${formatScore(recommendation.financialFeasibility)}.`, DETAIL_SIZE);
    const weights = recommendation.weights;
    this.flowText(weights ? `Applied weights: aptitude ${weights.aptitude}, demand ${weights.demand}, feasibility ${weights.feasibility}.` : "Applied weights unavailable.", DETAIL_SIZE, MUTED);
    const formatted = formatReasoningSummary(recommendation, { maxLength: Number.MAX_SAFE_INTEGER });
    this.flowText(formatted.summary);
    for (const concern of formatted.concerns) this.flowText(concern, DETAIL_SIZE, AMBER);
    this.flowText("See Evidence References for Counselor Review for the supporting inputs and full sources.", DETAIL_SIZE, MUTED);
  }

  private renderEvidenceReferences(): void {
    this.y -= 8;
    this.ensureSpace(118);
    this.drawSectionLabel("Evidence References for Counselor Review");
    this.flowText("AI-generated comparisons support counselor discussion, not educational decisions or probabilities of success.", DETAIL_SIZE, MUTED);
    this.flowText("Source currency is unverified. Check for outdated or superseding evidence. An ingestion date is not a publication date.", DETAIL_SIZE, MUTED);
    for (const recommendation of this.payload.rankedRecommendations.recommendations) {
      this.ensureSpace(60);
      this.flowText(recommendation.careerPath, BODY_SIZE, INK, "bold");
      const claims = formatReasoningSummary(recommendation, { maxLength: Number.MAX_SAFE_INTEGER }).claims;
      const references = [...new Set(claims.flatMap((claim) => claim.inputReferences))];
      const lines = [
        `Approved profile version: ${recommendation.approvedProfileVersion ?? "unavailable"}.`,
        `Approved input references: ${references.join(", ") || "unavailable"}.`,
      ];
      const sources = this.payload.auditTrail.find((entry) => entry.recommendationId === recommendation.id)?.sources ?? [];
      sources.forEach((source, index) => lines.push(
        `[${index + 1}] ${source.title}. Silo: ${source.siloId ?? "unavailable"}. Chunk: ${source.chunkIndex ?? "unavailable"}.`,
        `Source URL: ${publicSourceUrl(source.sourceUrl) ?? publicSourceUrl(source.reference) ?? "unavailable"}`,
        `Source reference: ${formatSourceReference(source.reference)}`,
        [
          sourceDate(source.publicationDate) ? `Publication date: ${source.publicationDate}` : "Publication date unavailable",
          sourceDate(source.ingestionTimestamp) ? `Ingestion date: ${source.ingestionTimestamp}` : "Ingestion date unavailable",
        ].join(" | "),
        `Acquisition: ${formatAcquisitionMethod(source.acquisitionMethod)}`,
      ));
      for (const value of lines) {
        // Break long URLs/field paths without dropping their query or fragment.
        const wrapped = value.replace(/\S{70,}/g, (word) => word.match(/.{1,60}/g)!.join(" "));
        for (const line of wrapText(wrapped, CONTENT_WIDTH, SOURCE_SIZE)) {
          this.ensureSpace(15);
          this.drawText(line, MARGIN_X, this.y, { size: SOURCE_SIZE, color: MUTED });
          this.y -= 14;
        }
        this.y -= 2;
      }
      this.y -= 12;
    }
  }

  private renderFooter(): void {
    this.pages.forEach((page, index) => {
      page.commands.push(
        line(MARGIN_X, 28, PAGE_WIDTH - MARGIN_X, 28, LINE),
        text("Kumpas | Generated as Draft. Approval recorded separately.", MARGIN_X, 16, {
          color: MUTED,
          size: 8.5,
        }),
        text(`Page ${index + 1} of ${this.pages.length}`, PAGE_WIDTH - MARGIN_X - 68, 16, {
          color: MUTED,
          size: 8.5,
        }),
      );
    });
  }

  private drawSectionLabel(label: string): void {
    this.drawText(label.toUpperCase(), MARGIN_X, this.y, {
      color: SAGE,
      font: "bold",
      size: 10,
    });
    this.y -= SECTION_LABEL_HEIGHT;
  }

  private drawScoreBar(x: number, y: number, width: number, value: number | null): void {
    this.drawRect(x, y, width, 5, [0.9, 0.91, 0.92]);
    this.drawRect(x, y, Math.max(0, Math.min(width, width * (value ?? 0) / 100)), 5, SAGE);
  }

  private drawRoundedPanel(x: number, y: number, width: number, height: number, color: Rgb): void {
    const radius = 8;
    const tangent = radius * 0.5523;
    const right = x + width;
    const top = y + height;
    const point = (a: number, b: number) => `${formatNumber(a)} ${formatNumber(b)}`;
    this.currentPage.commands.push([
      "q", `${rgb(color)} rg`, `${rgb(LINE)} RG`, "0.75 w",
      `${point(x + radius, y)} m`, `${point(right - radius, y)} l`,
      `${point(right - radius + tangent, y)} ${point(right, y + radius - tangent)} ${point(right, y + radius)} c`,
      `${point(right, top - radius)} l`,
      `${point(right, top - radius + tangent)} ${point(right - radius + tangent, top)} ${point(right - radius, top)} c`,
      `${point(x + radius, top)} l`,
      `${point(x + radius - tangent, top)} ${point(x, top - radius + tangent)} ${point(x, top - radius)} c`,
      `${point(x, y + radius)} l`,
      `${point(x, y + radius - tangent)} ${point(x + radius - tangent, y)} ${point(x + radius, y)} c`,
      "b", "Q",
    ].join("\n"));
  }

  private drawRect(x: number, y: number, width: number, height: number, color: Rgb): void {
    this.currentPage.commands.push(rect(x, y, width, height, color));
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

function createPdfDocument(pages: PdfPage[], contentMarker: string): Buffer {
  const objects: string[] = [];
  const pageRefs = pages.map((_, index) => 6 + index * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>";

  pages.forEach((page, index) => {
    const pageObjectNumber = pageRefs[index];
    const contentObjectNumber = pageObjectNumber + 1;
    const stream = page.commands.join("\n");

    objects[pageObjectNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber] =
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`;
  });

  const parts = ["%PDF-1.4\n", contentMarker];
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

function statusColor(status: RankedRecommendation["status"]): Rgb {
  if (status === "complete") {
    return SAGE;
  }

  if (status === "degraded") {
    return AMBER;
  }

  return RED;
}

function text(value: string, x: number, y: number, options: TextOptions = {}): string {
  const color = options.color ?? INK;
  const font = options.font === "serif" ? "F3" : options.font === "bold" ? "F2" : "F1";
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

  if (estimateTextWidth(sanitized, size) <= width) {
    return [sanitized];
  }

  const lines: string[] = [];
  const words = sanitized.split(" ").flatMap((word) => {
    if (estimateTextWidth(word, size) <= width) return [word];
    const pieces: string[] = [];
    let piece = "";
    for (const character of word) {
      if (piece && estimateTextWidth(piece + character, size) > width) { pieces.push(piece); piece = ""; }
      piece += character;
    }
    if (piece) pieces.push(piece);
    return pieces;
  });
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (estimateTextWidth(nextLine, size) > width) {
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

function estimateTextWidth(value: string, size: number): number {
  const units = Array.from(value).reduce(
    (total, character) => total + estimateCharacterWidth(character),
    0,
  );
  return (units / 1000) * size;
}

// Maximum standard Helvetica/Helvetica-Bold widths for ASCII 32 through 126.
// Conservative metrics keep both fonts inside the measured text column.
const HELVETICA_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 278, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  1015, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  278, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

function estimateCharacterWidth(character: string): number {
  return HELVETICA_WIDTHS[character.charCodeAt(0) - 32] ?? 1000;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function sanitizePdfText(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
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

function formatSourceReference(reference: string): string {
  const trimmed = reference.trim();

  if (/^file:\/\//i.test(trimmed)) {
    const path = trimmed.replace(/^file:\/\//i, "");
    const filename = path.split(/[\\/]/).filter(Boolean).pop();
    return filename ? `Local file: ${filename}` : "Local document";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const path = url.pathname === "/" ? "" : url.pathname;
      return `${url.hostname}${path}`;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

const ACQUISITION_METHOD_LABELS: Record<string, string> = {
  automated_csv: "Automated CSV",
  automated_pdf: "Automated PDF",
  operator_curated_csv: "Operator-curated CSV",
  operator_curated_pdf: "Operator-curated PDF",
  manual_curation: "Manual curation",
  uploaded_document: "Uploaded document",
  counselor_notes: "Counselor notes",
  retrieved_context: "Retrieved context",
  system_generated: "System generated",
  unknown: "Source pending",
};

function formatAcquisitionMethod(method: string): string {
  return ACQUISITION_METHOD_LABELS[method] ?? method;
}

function formatScore(value: number | null): string {
  return value === null ? "Unavailable" : `${value.toFixed(2)}/100`;
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return "unavailable";
  }

  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

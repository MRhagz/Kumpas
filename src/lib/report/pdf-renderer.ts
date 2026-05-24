import { formatReasoningSummary } from "@/lib/report/reasoning-formatter";
import type {
  AcademicDocumentType,
  KeySignalDetail,
  RankedRecommendation,
  RecommendationSource,
  ReportPayload,
} from "@/lib/report/types";

type Rgb = [number, number, number];

interface PdfPage {
  commands: string[];
}

interface TextOptions {
  color?: Rgb;
  font?: "regular" | "bold";
  size?: number;
  wordSpace?: number;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 38;
const MARGIN_BOTTOM = 38;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const SPACE_1 = 8;
const SPACE_3 = 24;
const HEADER_FONT_SIZES = [25, 22, 19, 17, 15];
const OVERVIEW_TITLE_SIZES = [11, 10, 9, 8];
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
): Promise<Buffer> {
  return buildReportPdf(payload);
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
    this.renderAcademicEvidence();
    this.renderRecommendationOverview();
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
  }

  private renderCoverHeader(): void {
    const profile = this.payload.studentProfile;
    const title =
      this.payload.rankedRecommendations.recommendations[0]?.careerPath ??
      profile.targetCareer ??
      "Career Recommendation";

    this.drawText("Kumpas Career Recommendation Report", MARGIN_X, this.y, {
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

    const headerText = `Assessment for ${title}`;
    const { lines: headerLines, size: headerSize } = fitHeadingToBox(
      headerText,
      CONTENT_WIDTH,
      HEADER_FONT_SIZES,
      3,
    );
    const headerLineHeight = Math.ceil(headerSize * 1.15);
    headerLines.forEach((headerLine) => {
      this.drawText(headerLine, MARGIN_X, this.y, {
        color: INK,
        font: "bold",
        size: headerSize,
      });
      this.y -= headerLineHeight;
    });
    this.y -= 4;
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
    const leftX = MARGIN_X + 16;
    const rightX = MARGIN_X + CONTENT_WIDTH / 2 + 8;
    const columnWidth = CONTENT_WIDTH / 2 - 24;

    const targetText = profile.targetCareer ?? "Not specified";
    const interestsText = formatList(profile.interests);
    const strengthsText = formatList(profile.strengths);
    const sharedInterests =
      normalizeForCompare(interestsText) === normalizeForCompare(strengthsText);

    const row2Lines = Math.max(
      wrapText(targetText, columnWidth, 9).length,
      1,
    );
    const row3Lines = sharedInterests
      ? wrapText(interestsText, CONTENT_WIDTH - 32, 9).length
      : Math.max(
          wrapText(interestsText, columnWidth, 9).length,
          wrapText(strengthsText, columnWidth, 9).length,
        );

    const topPad = 20;
    const bottomPad = 16;
    const rowGap = 12;
    const row1Height = 26;
    const row2Height = 13 + row2Lines * 11;
    const row3Height = 13 + Math.max(1, row3Lines) * 11;
    const panelHeight = topPad + row1Height + rowGap + row2Height + rowGap + row3Height + bottomPad;

    this.ensureSpace(panelHeight + 30);
    this.drawSectionLabel("Student Profile");
    this.drawRoundedPanel(MARGIN_X, this.y - panelHeight, CONTENT_WIDTH, panelHeight, PANEL);

    let cursorY = this.y - topPad;
    this.drawLabelValue("Student", profile.displayName ?? "Not specified", leftX, cursorY);
    this.drawLabelValue("Financial Status", capitalize(profile.financialStatus), rightX, cursorY);
    cursorY -= row1Height + rowGap;

    this.drawLabelWrapped("Target Career", targetText, leftX, cursorY, columnWidth);
    this.drawLabelValue("Approved At", formatDate(profile.approvedAt), rightX, cursorY);
    cursorY -= row2Height + rowGap;

    if (sharedInterests) {
      this.drawLabelWrapped(
        "Interests & Strengths",
        interestsText,
        leftX,
        cursorY,
        CONTENT_WIDTH - 32,
      );
    } else {
      this.drawLabelWrapped("Interests", interestsText, leftX, cursorY, columnWidth);
      this.drawLabelWrapped("Strengths", strengthsText, rightX, cursorY, columnWidth);
    }

    this.y -= panelHeight + 20;
  }

  private renderAcademicEvidence(): void {
    const evidence = this.payload.academicEvidence;
    const noteLines = Math.max(
      1,
      wrapText(evidence.completenessNote, CONTENT_WIDTH - 32, 9).length,
    );
    const topPad = 20;
    const bottomPad = 14;
    const documentsRowHeight = 26;
    const rowGap = 18;
    const noteHeight = noteLines * 11;
    const panelHeight = topPad + documentsRowHeight + rowGap + noteHeight + bottomPad;

    this.ensureSpace(panelHeight + 30);
    this.drawSectionLabel("Academic Evidence Completeness");
    this.drawRoundedPanel(MARGIN_X, this.y - panelHeight, CONTENT_WIDTH, panelHeight, PANEL);

    const leftX = MARGIN_X + 16;
    const rightX = MARGIN_X + CONTENT_WIDTH / 2 + 8;
    const topY = this.y - topPad;

    this.drawLabelValue(
      "Available Documents",
      formatAcademicDocuments(evidence.availableDocuments),
      leftX,
      topY,
      48,
    );
    this.drawLabelValue(
      "Missing Documents",
      formatAcademicDocuments(evidence.missingDocuments),
      rightX,
      topY,
      48,
    );
    this.drawParagraph(
      evidence.completenessNote,
      leftX,
      topY - documentsRowHeight - rowGap + 8,
      CONTENT_WIDTH - 32,
      9,
      11,
      evidence.missingDocuments.length > 0 ? AMBER : MUTED,
    );

    this.y -= panelHeight + 20;
  }

  private renderRecommendationOverview(): void {
    const recommendations = this.payload.rankedRecommendations.recommendations.slice(0, 3);
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

    const topRule = 4;
    const rankRowHeight = 22;
    const titleAreaHeight = titleAreaLines * titleLineHeight;
    const scoreBlockHeight = 50;
    const bottomPad = 12;
    const panelHeight = topRule + rankRowHeight + titleAreaHeight + 14 + scoreBlockHeight + bottomPad;

    this.ensureSpace(panelHeight + SPACE_3 + 14);
    this.drawSectionLabel("Recommendation Overview");
    const cardTop = this.y;

    recommendations.forEach((recommendation, index) => {
      const x = MARGIN_X + index * (cardWidth + gap);
      this.drawRoundedPanel(x, cardTop - panelHeight, cardWidth, panelHeight, PANEL);
      this.drawRect(x, cardTop - topRule, cardWidth, topRule, statusColor(recommendation.status));
      this.drawText(`RANK ${recommendation.rank}`, x + SPACE_1, cardTop - 18, {
        color: MUTED,
        font: "bold",
        size: 7,
      });
      const overviewTitleLines = wrapText(
        recommendation.careerPath,
        cardWidth - SPACE_1 * 2,
        chosenSize,
      ).slice(0, maxTitleLines);
      const titleTop = cardTop - topRule - rankRowHeight - 4;
      overviewTitleLines.forEach((overviewLine, lineIndex) => {
        this.drawText(overviewLine, x + SPACE_1, titleTop - lineIndex * titleLineHeight, {
          color: INK,
          font: "bold",
          size: chosenSize,
        });
      });
      const scoreY = titleTop - titleAreaHeight - 18;
      this.drawText(formatPercent(recommendation.alignmentScore), x + SPACE_1, scoreY, {
        color: SAGE_DARK,
        font: "bold",
        size: 18,
      });
      this.drawScoreBar(x + 58, scoreY - 4, cardWidth - 70, recommendation.alignmentScore);
      this.drawText(recommendation.status.toUpperCase(), x + SPACE_1, scoreY - 17, {
        color: statusColor(recommendation.status),
        font: "bold",
        size: 7,
      });
    });

    this.y -= panelHeight + SPACE_3;
  }

  private renderRecommendations(): void {
    this.addPage();
    this.drawSectionLabel("Ranked Career Recommendations");
    this.y -= 4;
    this.payload.rankedRecommendations.recommendations.forEach((recommendation) => {
      this.renderRecommendation(recommendation);
    });
  }

  private renderRecommendation(recommendation: RankedRecommendation): void {
    const leftX = MARGIN_X + 16;
    const rightX = MARGIN_X + 342;
    const leftWidth = 300;
    const rightWidth = 164;
    const headerHeight = 46;
    const scoreBlockHeight = 90;
    const bodyBottomPad = 14;

    const formattedReasoning = formatReasoningSummary(recommendation, { maxLength: 4000 });

    const signalsHeight = measureKeySignalRows(
      recommendation.keySignalDetails,
      recommendation.keySignals,
      leftWidth,
      4,
    );
    const reasoningLines = Math.max(
      1,
      wrapText(formattedReasoning.summary, leftWidth, 9).length,
    );
    const reasoningHeight = reasoningLines * 11;
    const concernsBlockHeight =
      formattedReasoning.concerns.length > 0 ? 52 : 0;

    const leftBodyHeight =
      16 + signalsHeight + 10 + 16 + reasoningHeight + concernsBlockHeight;

    const auditTrail = this.payload.auditTrail.find(
      (entry) => entry.recommendationId === recommendation.id,
    );
    const sources = auditTrail?.sources ?? [];
    const sourceCount = Math.max(1, sources.length);
    const sourcesHeight = 70 + (sourceCount - 1) * 77;
    const rightBodyHeight = 16 + sourcesHeight;

    const bodyHeight = Math.max(leftBodyHeight, rightBodyHeight);
    const cardHeight = headerHeight + scoreBlockHeight + bodyHeight + bodyBottomPad;

    this.ensureSpace(cardHeight + 18);

    const cardTop = this.y;
    this.drawRoundedPanel(MARGIN_X, cardTop - cardHeight, CONTENT_WIDTH, cardHeight, [1, 1, 1]);
    this.drawRect(MARGIN_X, cardTop - headerHeight, CONTENT_WIDTH, headerHeight, SAGE_DARK);

    this.drawText(`Recommendation ${recommendation.rank}`, MARGIN_X + 16, cardTop - 15, {
      color: [0.82, 0.92, 0.88],
      font: "bold",
      size: 7,
    });
    const pillX = PAGE_WIDTH - MARGIN_X - 96;
    const titleX = MARGIN_X + 16;
    const titleMaxWidth = pillX - titleX - 12;
    const { text: titleText, size: titleSize } = fitTitleToWidth(
      recommendation.careerPath,
      titleMaxWidth,
      [15, 13, 11],
    );
    this.drawText(titleText, titleX, cardTop - 31, {
      color: [1, 1, 1],
      font: "bold",
      size: titleSize,
    });
    this.drawStatusPill(recommendation.status, pillX, cardTop - 26);

    this.renderScoreCards(recommendation, cardTop - 64);

    const bodyTop = cardTop - headerHeight - scoreBlockHeight;

    this.drawMiniHeading("Key Signals", leftX, bodyTop);
    const signalsEndY = this.drawKeySignalDetails(
      recommendation.keySignalDetails,
      recommendation.keySignals,
      leftX,
      bodyTop - 16,
      leftWidth,
      4,
    );

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

    this.y = cardTop - cardHeight - 18;
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
    const sources = auditTrail?.sources ?? [];

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
    const height = 70;
    const textX = x + 9;
    const textWidth = width - 18;
    this.drawRect(x, y - height, width, height, [0.992, 0.992, 0.992]);
    this.drawRect(x, y - height, 3, height, SAGE);
    this.drawLine(x, y - height, x + width, y - height, LINE);
    this.drawLine(x, y, x + width, y, LINE);

    const titleLines = wrapHeading(source.title, textWidth, 8, 2);
    titleLines.forEach((titleLine, index) => {
      this.drawText(titleLine, textX, y - 14 - index * 10, {
        color: INK,
        font: "bold",
        size: 8,
      });
    });

    this.drawText(fitToWidth(formatSourceReference(source.reference), textWidth, 7), textX, y - 38, {
      color: MUTED,
      size: 7,
    });
    this.drawText(formatAcquisitionMethod(source.acquisitionMethod), textX, y - 50, {
      color: SAGE_DARK,
      font: "bold",
      size: 7,
    });
    this.drawText(`Ingested ${formatDate(source.ingestionTimestamp)}`, textX, y - 62, {
      color: MUTED,
      size: 6,
    });

    return y - height;
  }

  private renderFooter(): void {
    this.pages.forEach((page, index) => {
      page.commands.push(
        line(MARGIN_X, 28, PAGE_WIDTH - MARGIN_X, 28, LINE),
        text("Kumpas Career Recommendation Report", MARGIN_X, 16, {
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

  private drawLabelWrapped(
    label: string,
    value: string,
    x: number,
    y: number,
    width: number,
  ): void {
    this.drawText(label, x, y, {
      color: MUTED,
      font: "bold",
      size: 7,
    });
    const lines = wrapText(value, width, 9);
    lines.forEach((line, index) => {
      this.drawText(line, x, y - 13 - index * 11, {
        color: INK,
        font: "bold",
        size: 9,
      });
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
      this.drawText("-", x, currentY, { color: SAGE, font: "bold", size: 8 });
      currentY = this.drawParagraph(value, x + 9, currentY, width - 9, 8, 10, color);
      currentY -= 3;
    });

    if (values.length === 0) {
      currentY = this.drawParagraph("None listed", x, currentY, width, 8, 10, MUTED);
    }

    return currentY;
  }

  private drawKeySignalDetails(
    details: KeySignalDetail[],
    fallbackSignals: string[],
    x: number,
    y: number,
    width: number,
    maxItems: number,
  ): number {
    const rows: KeySignalDetail[] =
      details.length > 0
        ? details.slice(0, maxItems)
        : fallbackSignals.slice(0, maxItems).map((signal, index) => ({
            label: `Signal ${index + 1}`,
            value: signal,
            polarity: "neutral" as const,
          }));

    if (rows.length === 0) {
      return this.drawParagraph("None listed", x, y, width, 8, 10, MUTED);
    }

    let currentY = y;
    rows.forEach((row) => {
      const color = signalPolarityColor(row.polarity);
      this.drawText(signalPolarityGlyph(row.polarity), x, currentY, {
        color,
        font: "bold",
        size: 8,
      });
      this.drawText(truncateText(row.label, 22), x + 10, currentY, {
        color: INK,
        font: "bold",
        size: 8,
      });
      currentY = this.drawParagraph(
        row.value,
        x + 92,
        currentY,
        width - 92,
        8,
        10,
        INK,
      );

      if (row.subNote) {
        currentY = this.drawParagraph(
          row.subNote,
          x + 92,
          currentY - 1,
          width - 92,
          7,
          9,
          MUTED,
        );
      }

      currentY -= 4;
    });

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
    justify: boolean = true,
  ): number {
    const lines = wrapText(value, width, size);
    let currentY = y;

    lines.forEach((wrappedLine, index) => {
      const isLast = index === lines.length - 1;
      const wordSpace =
        justify && !isLast && lines.length > 1
          ? computeJustifyWordSpace(wrappedLine, width, size)
          : 0;
      this.drawText(wrappedLine, x, currentY, { color, size, wordSpace });
      currentY -= lineHeight;
    });

    return currentY;
  }

  private drawStatusPill(status: RankedRecommendation["status"], x: number, y: number): void {
    const color = statusColor(status);
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

function statusColor(status: RankedRecommendation["status"]): Rgb {
  if (status === "complete") {
    return SAGE;
  }

  if (status === "degraded") {
    return AMBER;
  }

  return RED;
}

function signalPolarityColor(polarity: KeySignalDetail["polarity"]): Rgb {
  if (polarity === "positive") {
    return SAGE;
  }

  if (polarity === "negative") {
    return RED;
  }

  return MUTED;
}

function signalPolarityGlyph(polarity: KeySignalDetail["polarity"]): string {
  if (polarity === "positive") {
    return "+";
  }

  if (polarity === "negative") {
    return "-";
  }

  return "=";
}

function text(value: string, x: number, y: number, options: TextOptions = {}): string {
  const color = options.color ?? INK;
  const font = options.font === "bold" ? "F2" : "F1";
  const size = options.size ?? 10;
  const wordSpace = options.wordSpace ?? 0;

  return [
    "BT",
    `${rgb(color)} rg`,
    `/${font} ${size} Tf`,
    `${formatNumber(wordSpace)} Tw`,
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

function maxCharsForWidth(width: number, size: number): number {
  return Math.max(4, Math.floor(width / (size * 0.52)));
}

function fitToWidth(value: string, width: number, size: number): string {
  return truncateText(value, maxCharsForWidth(width, size));
}

function fitTitleToWidth(
  value: string,
  width: number,
  sizes: number[],
): { text: string; size: number } {
  const sanitized = sanitizePdfText(value);
  for (const size of sizes) {
    if (sanitized.length <= maxCharsForWidth(width, size)) {
      return { text: sanitized, size };
    }
  }
  const smallest = sizes[sizes.length - 1];
  return { text: fitToWidth(sanitized, width, smallest), size: smallest };
}

function computeJustifyWordSpace(line: string, width: number, size: number): number {
  const spaces = (line.match(/ /g) ?? []).length;
  if (spaces === 0) {
    return 0;
  }
  const approxWidth = line.length * size * 0.52;
  const slack = width - approxWidth;
  if (slack <= 0) {
    return 0;
  }
  return Math.min(slack / spaces, size * 0.5);
}

function fitHeadingToBox(
  value: string,
  width: number,
  sizes: number[],
  maxLines: number,
): { lines: string[]; size: number } {
  for (const size of sizes) {
    const lines = wrapText(value, width, size);
    if (lines.length <= maxLines) {
      return { lines, size };
    }
  }
  const smallest = sizes[sizes.length - 1];
  return { lines: wrapHeading(value, width, smallest, maxLines), size: smallest };
}

function measureKeySignalRows(
  details: KeySignalDetail[],
  fallbackSignals: string[],
  width: number,
  maxItems: number,
): number {
  const rows: KeySignalDetail[] =
    details.length > 0
      ? details.slice(0, maxItems)
      : fallbackSignals.slice(0, maxItems).map((signal, index) => ({
          label: `Signal ${index + 1}`,
          value: signal,
          polarity: "neutral" as const,
        }));

  if (rows.length === 0) {
    return 10;
  }

  let total = 0;
  rows.forEach((row) => {
    const valueLines = Math.max(1, wrapText(row.value, width - 92, 8).length);
    total += valueLines * 10;
    if (row.subNote) {
      const subNoteLines = Math.max(1, wrapText(row.subNote, width - 92, 7).length);
      total += 1 + subNoteLines * 9;
    }
    total += 4;
  });
  return total;
}

function wrapHeading(
  value: string,
  width: number,
  size: number,
  maxLines: number,
): string[] {
  const lines = wrapText(value, width, size);

  if (lines.length <= maxLines) {
    return lines;
  }

  const kept = lines.slice(0, maxLines - 1);
  const remaining = lines.slice(maxLines - 1).join(" ");
  const maxChars = maxCharsForWidth(width, size);
  const lastLine = remaining.length > maxChars
    ? `${remaining.slice(0, maxChars - 3).trimEnd()}...`
    : remaining;
  kept.push(lastLine);
  return kept;
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

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "None listed";
}

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatAcademicDocuments(documents: AcademicDocumentType[]): string {
  return documents.length > 0
    ? documents.map(formatAcademicDocument).join(", ")
    : "None";
}

function formatAcademicDocument(document: AcademicDocumentType): string {
  if (document === "form137") {
    return "Form 137";
  }

  return document.toUpperCase();
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

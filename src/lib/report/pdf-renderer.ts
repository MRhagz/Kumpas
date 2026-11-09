import { buildStudentSummary, documentLabel, formatReasoningSummary } from "./reasoning-formatter";
import { inputLabel, publicSourceUrl, sourceDate, type EvidenceClaim } from "./evidence-summary";
import { reportContentMarker } from "./types";
import { ReportPdfFont, pdfStream, type PdfFontWeight } from "./pdf-font";
import type { RankedRecommendation, RecommendationSource, ReportPayload } from "./types";

type Rgb = [number, number, number];
interface PdfPage { commands: string[]; links: { url: string; rect: number[] }[] }
interface TextStyle { size?: number; font?: PdfFontWeight; color?: Rgb; right?: boolean }

// A4, with 22 mm page margins. Footer sits inside the bottom margin.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 62.36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = MARGIN;
const TOP = PAGE_HEIGHT - MARGIN;
const BODY = 11;
const LEADING = 15;
const HEADING = 14;
const INK: Rgb = [0.13, 0.15, 0.14];
const MUTED: Rgb = [0.34, 0.37, 0.35];
const GREEN: Rgb = [0.24, 0.36, 0.29];
const LINE: Rgb = [0.78, 0.81, 0.79];
const SHADE: Rgb = [0.95, 0.96, 0.95];
const COLUMNS = [
  { x: 0, width: 214, lines: ["Pathway"] },
  { x: 214, width: 60, lines: ["Aptitude"] },
  { x: 274, width: 57, lines: ["Demand"] },
  { x: 331, width: 67, lines: ["Feasibility"] },
  { x: 398, width: CONTENT_WIDTH - 398, lines: ["Overall", "alignment"] },
];

export async function renderReportPdf(payload: ReportPayload): Promise<Buffer> {
  return buildReportPdf(payload);
}

export function buildReportPdf(payload: ReportPayload): Buffer {
  return new CareerGuidancePdf(payload).render();
}

class CareerGuidancePdf {
  private readonly fonts = { regular: new ReportPdfFont("regular"), bold: new ReportPdfFont("bold") };
  private readonly pages: PdfPage[] = [];
  private page!: PdfPage;
  private y = TOP;
  private paragraphGap = 6;
  private readonly summary;
  private readonly sources: RecommendationSource[] = [];
  private readonly sourceNumbers = new Map<string, number>();

  constructor(private readonly payload: ReportPayload) {
    this.summary = payload.studentSummary ?? buildStudentSummary(payload.rankedRecommendations, payload.academicEvidence);
    for (const recommendation of payload.rankedRecommendations.recommendations) {
      for (const source of this.localSources(recommendation)) {
        if (source.reference === "source-unavailable") continue;
        const key = referenceKey(source);
        if (!this.sourceNumbers.has(key)) {
          this.sources.push(source);
          this.sourceNumbers.set(key, this.sources.length);
        }
      }
    }
  }

  render(): Buffer {
    this.addPage();
    this.header();
    this.section("Takeaway", 65);
    this.paragraph(this.takeaway(), { font: "bold", size: 12 });
    if (!this.payload.academicEvidence.availableDocuments.length) this.paragraph("No usable academic records were available.");
    this.comparison();
    this.records();
    this.addPage();
    this.supportingAnalysis();
    this.addPage();
    this.limitations();
    this.references();
    this.auditAppendix();
    this.footers();
    return this.serialize();
  }

  private header(): void {
    this.paragraph("KUMPAS  /  CAREER GUIDANCE", { font: "bold", color: GREEN });
    this.paragraph("Career Guidance Report", { size: 24, font: "bold" });
    this.paragraph(`Generated ${formatDate(this.payload.generatedAt)}. Report version: ${this.payload.reportVersion ?? "unavailable"}. Approved profile version: ${this.payload.approvedProfileVersion ?? "unavailable"}.`);
    this.paragraph("Generated as Draft for counselor review. Approval is recorded separately.", { color: MUTED });
    const notice = this.summary.findings.find((finding) => finding.startsWith("LAYOUT DEMONSTRATION ONLY:"));
    if (notice) this.paragraph(notice, { font: "bold", color: GREEN });
    this.separator();
  }

  private takeaway(): string {
    const scored = this.payload.rankedRecommendations.recommendations.filter((option) => option.rank !== null && option.alignmentScore !== null);
    if (!scored.length) return `No overall ranking. ${this.summary.findings.find((finding) => !finding.startsWith("LAYOUT DEMONSTRATION")) ?? "Review missing evidence before comparing overall fit."}`;
    const leader = scored[0];
    const leaders = scored.filter((option) => option.alignmentScore === leader.alignmentScore);
    if (leaders.length > 1) return `${leaders.length} pathways share the top score; compare their component strengths and practical requirements.`;
    if (scored.length === 1) return `${leader.careerPath} is the only scored pathway; no other overall score is available for comparison.`;
    const feasibility = scored.every((option) => formatReasoningSummary(option).claims.some(({ dimension }) => dimension === "feasibility"))
      ? scored.filter((option) => option.financialFeasibility === Math.max(...scored.map((path) => path.financialFeasibility!))) : [];
    const alternative = feasibility.length === 1 && feasibility[0].id !== leader.id ? feasibility[0] : null;
    const gap = (leader.alignmentScore! - (alternative ?? scored[1]).alignmentScore!).toFixed(2).replace(/0$/, "");
    return alternative
      ? `${leader.careerPath} leads overall; ${alternative.careerPath} scores highest on feasibility. Their overall scores are ${gap} points apart.`
      : `${leader.careerPath} leads overall. The top two overall scores are ${gap} points apart.`;
  }

  private comparison(): void {
    this.section("Pathway comparison", 110);
    this.paragraph("Scores are out of 100. Aptitude compares fit, demand compares work opportunities, and feasibility compares practical requirements.");
    this.tableHeader();
    let partialHeadingShown = false;
    for (const recommendation of this.payload.rankedRecommendations.recommendations) {
      const claims = formatReasoningSummary(recommendation).claims;
      const values = [
        claims.some(({ dimension }) => dimension === "aptitude") ? recommendation.aptitudeFit : null,
        claims.some(({ dimension }) => dimension === "demand") ? recommendation.marketDemand : null,
        claims.some(({ dimension }) => dimension === "feasibility") ? recommendation.financialFeasibility : null,
        recommendation.rank === null ? null : recommendation.alignmentScore,
      ];
      if (recommendation.rank === null && !partialHeadingShown) {
        this.ensureSpace(75);
        this.paragraph("Unscored partial comparisons", { font: "bold" });
        partialHeadingShown = true;
      }
      const nameLines = this.wrap(recommendation.careerPath, COLUMNS[0].width - 16, { font: "bold" });
      // Long titles continue with a repeated table header and retain every word.
      let offset = 0;
      while (offset < nameLines.length) {
        const maximum = Math.floor((TOP - BOTTOM - 58) / LEADING);
        const lines = nameLines.slice(offset, offset + maximum);
        const height = Math.max(48, lines.length * LEADING + 25);
        if (this.y - height < BOTTOM) { this.addPage(); this.tableHeader(); }
        const top = this.y;
        if (recommendation.rank === 1) this.rect(MARGIN, top - height, CONTENT_WIDTH, height, SHADE);
        lines.forEach((value, index) => this.draw(value, MARGIN + 7, top - 16 - index * LEADING, { font: "bold" }));
        if (offset === 0) {
          this.draw(recommendation.rank === null ? "Unscored" : `Rank ${recommendation.rank}`, MARGIN + 7, top - 16 - lines.length * LEADING, { color: MUTED });
          values.forEach((value, index) => {
            const column = COLUMNS[index + 1];
            // A dash fits a numeric column; the table note explains its meaning.
            this.draw(value === null ? index === 3 ? "Unscored" : "—" : value.toFixed(2), MARGIN + column.x + column.width - 7, top - 16, {
              right: true, font: index === 3 ? "bold" : "regular", color: index === 3 ? GREEN : INK,
            });
            if (value !== null) {
              // Every component uses an identical physical 0–100 scale.
              const barWidth = 40;
              const x = MARGIN + column.x + column.width - 7 - barWidth;
              this.rect(x, top - 29, barWidth, 3, LINE);
              this.rect(x, top - 29, barWidth * value / 100, 3, GREEN);
            }
          });
        }
        this.y -= height;
        this.rule(this.y);
        offset += lines.length;
      }
    }
    this.y -= 10;
    this.paragraph("Bars compare scores on the same 0–100 scale; they do not show completion. — Unavailable, never zero. Equal overall scores share a rank.", { color: MUTED });
  }

  private tableHeader(): void {
    const height = 35;
    this.rect(MARGIN, this.y - height, CONTENT_WIDTH, height, SHADE);
    for (const [index, column] of COLUMNS.entries()) {
      for (const [line, value] of column.lines.entries()) this.draw(value,
        MARGIN + column.x + (index === 0 ? 7 : column.width - 7), this.y - 13 - line * 13,
        { font: "bold", right: index !== 0, color: index === 4 ? GREEN : INK });
    }
    this.y -= height;
    this.rule(this.y);
  }

  private supportingAnalysis(): void {
    this.section("Pathway explanations", 110);
    for (const recommendation of this.payload.rankedRecommendations.recommendations) {
      const formatted = formatReasoningSummary(recommendation);
      const components = this.components(recommendation, formatted.claims);
      const highest = Math.max(...components.map(({ score }) => score));
      const lowest = Math.min(...components.map(({ score }) => score));
      const weakest = components.filter(({ score }) => score === lowest);
      const missing = ["aptitude", "demand", "feasibility"].filter((dimension) => !components.some((component) => component.dimension === dimension));
      const fit = this.relativeFit(recommendation, formatted.claims) || (components.length > 1
        ? lowest === highest ? "The supported components are equal; no relative strength stands out."
          : `${capitalize(components.filter(({ score }) => score === highest).map(({ dimension }) => dimension).join(" and "))} is its highest-scoring component.`
        : components.length === 1 ? `Only ${components[0].dimension} has verified support; ${recommendation.rank === null ? "overall fit is unscored" : "verify the evidence behind this ranking"}.`
        : "Evidence summary unavailable. Review the approved inputs before relying on this comparison.");
      const checks = [
        ...(lowest < highest ? weakest.map(({ dimension, check }) => `${check}; ${dimension} is its lowest-scoring component.`) : []),
        ...(missing.length ? [`Verify missing or unverified ${missing.join(", ")} evidence before comparing overall fit.`] : []),
      ].join(" ") || "Confirm provider requirements and personal preferences; equal scores do not establish equal real-world outcomes.";
      const evidence = formatted.claims.map((claim) => this.claimDescription(recommendation, claim)).join("; ") || formatted.summary;
      this.pathwayBlock(recommendation.careerPath, fit, checks, `Supporting evidence: ${evidence}.`);
    }
    this.section("Next steps for the session", 100);
    for (const action of [
      "Discuss the options with your counselor and choose which two pathways to investigate first.",
      "Check current entry requirements, total costs and financial support with each provider.",
      "Confirm your education stage and suitable study, training or work routes; review missing evidence before deciding.",
    ]) this.checkbox(action);
  }

  private components(recommendation: RankedRecommendation, claims: EvidenceClaim[]) {
    return [
      { dimension: "aptitude", score: recommendation.aptitudeFit, check: "Study demands and prerequisite skills" },
      { dimension: "demand", score: recommendation.marketDemand, check: "Current local opportunities and entry-level roles" },
      { dimension: "feasibility", score: recommendation.financialFeasibility, check: "Costs, entry requirements and financial support" },
    ].flatMap((component) => component.score !== null && claims.some(({ dimension }) => dimension === component.dimension)
      ? [{ ...component, score: component.score }] : []);
  }

  private pathwayBlock(title: string, fit: string, checks: string, evidence: string): void {
    const gap = 20;
    const width = (CONTENT_WIDTH - gap) / 2;
    const titleLines = this.wrap(title, CONTENT_WIDTH, { font: "bold", size: 12 });
    const left = this.wrap(fit, width), right = this.wrap(checks, width);
    const evidenceLines = this.wrap(evidence, CONTENT_WIDTH);
    const height = titleLines.length * 16 + 26 + Math.max(left.length, right.length) * LEADING + 8 + evidenceLines.length * LEADING + 16;
    // Keep ordinary pathway blocks together; exceptionally long text can flow.
    this.ensureSpace(Math.min(height, TOP - BOTTOM));
    for (const line of titleLines) { this.ensureSpace(16); this.draw(line, MARGIN, this.y - 12, { font: "bold", size: 12, color: GREEN }); this.y -= 16; }
    this.y -= 7;
    this.ensureSpace(40);
    this.draw("Why it stands out", MARGIN, this.y - BODY, { font: "bold" });
    this.draw("What to check", MARGIN + width + gap, this.y - BODY, { font: "bold" });
    this.y -= 22;
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
      this.ensureSpace(LEADING);
      if (left[index]) this.draw(left[index], MARGIN, this.y - BODY);
      if (right[index]) this.draw(right[index], MARGIN + width + gap, this.y - BODY);
      this.y -= LEADING;
    }
    this.y -= 8;
    this.paragraph(evidence, { color: MUTED });
    this.separator();
  }

  private records(): void {
    this.ensureSpace(152);
    this.section("Academic records", 100);
    const evidence = this.payload.academicEvidence;
    const rows = (["form137", "ncae", "nat"] as const).map((document) => {
      const usable = evidence.availableDocuments.includes(document);
      const status = evidence.documentStatuses?.[document] ?? (usable ? "provided" : "absent");
      return [documentLabel(document), usable ? "Available" : status === "provided" ? "No usable data" : status === "absent" ? "Missing" : capitalize(status)];
    });
    this.dataTable(["Document", "Availability"], [CONTENT_WIDTH - 106, 106], rows);
  }

  private checkbox(value: string): void {
    const lines = this.wrap(value, CONTENT_WIDTH - 20);
    this.ensureSpace(lines.length * LEADING + 8);
    this.page.commands.push(`q ${rgb(GREEN)} RG 0.7 w ${n(MARGIN)} ${n(this.y - 10)} 8 8 re S Q`);
    for (const line of lines) { this.draw(line, MARGIN + 20, this.y - BODY); this.y -= LEADING; }
    this.y -= 8;
  }

  private claimDescription(recommendation: RankedRecommendation, claim: EvidenceClaim): string {
    const inputs = claim.inputReferences.map((reference) => inputLabel(reference).replace(/\bsubjects /g, "").replace(/\bstrand scores /g, ""));
    const citations = this.citations(recommendation, claim);
    const references = citations.map((number) => `[${number}]`).join(", ");
    return claim.dimension === "aptitude" ? [...inputs, references].filter(Boolean).join(", ")
      : `${capitalize(claim.dimension)}: ${references || inputs.join(", ")}`;
  }

  private relativeFit(recommendation: RankedRecommendation, claims: EvidenceClaim[]): string {
    if (!claims.length || recommendation.rank === null) return "";
    const ranked = this.payload.rankedRecommendations.recommendations.filter((option) => option.rank !== null);
    if (ranked.length < 2) return "";
    const fields = { aptitude: "aptitudeFit", demand: "marketDemand", feasibility: "financialFeasibility" } as const;
    const strongest = claims.filter(({ dimension }) => ranked.every((option) =>
      option.id === recommendation.id || (formatReasoningSummary(option).claims.some((claim) => claim.dimension === dimension)
        && recommendation[fields[dimension]]! > option[fields[dimension]]!))).map(({ dimension }) => dimension);
    return strongest.length ? `Highest ${strongest.join(" and ")} ${strongest.length === 1 ? "score" : "scores"} among these options.` : "";
  }

  private limitations(): void {
    this.section("Limitations", 100);
    const limitations = [
      this.summary.disclosure,
      "Scores are points out of 100, not probabilities of career success. Component strengths describe relative scores, not confirmed personal strengths.",
      this.summary.scope,
      ...this.summary.limitations.filter((value) => !value.startsWith("Missing academic evidence:") && !value.includes("was unreadable") && !value.includes("was unsupported")),
      "An ingestion date is not a publication date. Check for newer or superseding sources.",
    ];
    const height = limitations.reduce((sum, value) => sum + this.wrap(value, CONTENT_WIDTH - 24).length * LEADING + 6, 0) + 18;
    if (height <= TOP - BOTTOM) {
      this.ensureSpace(height);
      this.rect(MARGIN, this.y - height, CONTENT_WIDTH, height, SHADE);
      this.y -= 10;
      for (const value of limitations) {
        for (const line of this.wrap(value, CONTENT_WIDTH - 24)) { this.draw(line, MARGIN + 12, this.y - BODY); this.y -= LEADING; }
        this.y -= 6;
      }
      this.y -= 8;
    } else {
      for (const value of limitations) this.paragraph(value);
    }
  }

  private references(): void {
    this.section("References", 85);
    if (!this.sources.length) { this.paragraph("No supporting reference sources are available."); return; }
    this.sources.forEach((source, index) => {
      const url = publicSourceUrl(source.sourceUrl) ?? publicSourceUrl(source.reference);
      const title = `[${index + 1}] ${source.title}`;
      const publication = sourceDate(source.publicationDate) ? `Published ${source.publicationDate}.` : "Publication date unavailable.";
      const publisher = source.publisher?.trim() || "Publisher not supplied";
      const height = this.textHeight(title, { font: "bold" }) + this.textHeight(`${publisher}. ${publication}`)
        + this.textHeight(url ?? "Public link unavailable.") + 24;
      this.ensureSpace(Math.min(height, TOP - BOTTOM));
      this.paragraph(title, { font: "bold" });
      this.paragraph(`${publisher}. ${publication}`);
      if (url) this.paragraph(url, { color: GREEN }, url);
      else this.paragraph("Public link unavailable.", { color: MUTED });
      this.y -= 8;
    });
  }

  private auditAppendix(): void {
    this.paragraphGap = 3;
    this.section("Counselor detail / Audit appendix", 90);
    this.paragraph(`Inputs approved: ${formatDate(this.payload.studentProfile.approvedAt)}. Confidential note text is withheld.`);
    const weights = new Map<string, string[]>();
    for (const recommendation of this.payload.rankedRecommendations.recommendations) {
      const value = recommendation.weights;
      const description = value ? `Applied weights: aptitude ${value.aptitude}, demand ${value.demand}, feasibility ${value.feasibility}.` : "Applied weights unavailable.";
      weights.set(description, [...(weights.get(description) ?? []), recommendation.id]);
    }
    for (const [description, ids] of weights) this.paragraph(weights.size === 1 ? description : `${ids.join(", ")}: ${description}`);
    this.paragraph("Overall alignment is the weighted component total, rounded to two decimals. Equal totals share a rank. Missing components receive no total or rank.");
    const records = new Map<string, RecommendationSource>();
    const coverage = this.payload.rankedRecommendations.recommendations.map((recommendation) => {
      const formatted = formatReasoningSummary(recommendation);
      const identity = `${recommendation.careerPath}\nPath ID: ${recommendation.id}\nProfile: ${recommendation.approvedProfileVersion ?? "unavailable"}\nStatus: ${recommendation.status}`;
      const inputs = formatted.claims.map((claim) => `${capitalize(claim.dimension)}: ${claim.inputReferences.join(", ") || "no profile input"}; references ${this.citations(recommendation, claim).map((number) => `[${number}]`).join(", ") || "none"}.`);
      const unverified = [
        { dimension: "aptitude", score: recommendation.aptitudeFit }, { dimension: "demand", score: recommendation.marketDemand }, { dimension: "feasibility", score: recommendation.financialFeasibility },
      ].filter(({ dimension, score }) => score !== null && !formatted.claims.some((claim) => claim.dimension === dimension));
      if (unverified.length) inputs.push(`Stored components (evidence unverified): ${unverified.map(({ dimension, score }) => `${dimension} ${score!.toFixed(2)}/100`).join(", ")}.`);
      inputs.push(...formatted.concerns.filter((value) => !value.startsWith("Source currency") && !value.startsWith("Missing evidence:")));
      const sourceRecords = this.localSources(recommendation).map((source) => {
        records.set(source.id, source);
        return `${this.number(source) === undefined ? "Uncited" : `[${this.number(source)}]`} ID ${source.id}`;
      });
      return [identity, inputs.join("\n") || "Evidence summary unavailable", sourceRecords.join("\n") || "Unavailable"];
    });
    this.dataTable(["Pathway / identity", "Approved inputs / references", "Source record IDs"], [132, 205, CONTENT_WIDTH - 337], coverage);
    this.section("Source record metadata", 75);
    const groups = new Map<string, RecommendationSource[]>();
    for (const source of records.values()) {
      const key = JSON.stringify([this.number(source), sourceDate(source.ingestionTimestamp), source.acquisitionMethod, source.reference]);
      groups.set(key, [...(groups.get(key) ?? []), source]);
    }
    const metadata = [...groups.values()].map((group) => {
      const source = group[0];
      const reference = this.number(source) === undefined ? "Uncited" : `[${this.number(source)}]`;
      const details = [sourceDate(source.ingestionTimestamp) ? `Ingestion date: ${source.ingestionTimestamp}` : "Ingestion date unavailable", `Acquisition: ${source.acquisitionMethod}`];
      if (source.reference !== (publicSourceUrl(source.sourceUrl) ?? publicSourceUrl(source.reference))) details.push(`Source reference: ${safeReference(source.reference)}`);
      return [reference, group.map((record) => `ID ${record.id}\nSilo: ${record.siloId ?? "unavailable"}; Chunk: ${record.chunkIndex ?? "unavailable"}`).join("\n"), details.join("\n")];
    });
    this.dataTable(["Reference", "Records / retrieval location", "Acquisition / currency"], [76, 216, CONTENT_WIDTH - 292], metadata);
  }

  private dataTable(headers: string[], widths: number[], rows: string[][]): void {
    const padding = 6;
    const headerLines = headers.map((header, index) => this.wrap(header, widths[index] - padding * 2, { font: "bold" }));
    const headerHeight = Math.max(...headerLines.map((lines) => lines.length)) * LEADING + padding * 2;
    const header = () => {
      this.rect(MARGIN, this.y - headerHeight, CONTENT_WIDTH, headerHeight, SHADE);
      let x = MARGIN;
      headerLines.forEach((lines, index) => {
        lines.forEach((line, offset) => this.draw(line, x + padding, this.y - BODY - padding - offset * LEADING, { font: "bold" }));
        x += widths[index];
      });
      this.y -= headerHeight;
      this.rule(this.y);
    };
    const firstRowHeight = rows.length ? Math.max(...rows[0].map((value, index) => value.split("\n").flatMap((line) => this.wrap(line, widths[index] - padding * 2)).length)) * LEADING + padding * 2 : 0;
    this.ensureSpace(headerHeight + Math.min(firstRowHeight, TOP - BOTTOM - headerHeight));
    header();
    for (const row of rows) {
      const cells = row.map((value, index) => value.split("\n").flatMap((line) => this.wrap(line, widths[index] - padding * 2)));
      const count = Math.max(...cells.map((lines) => lines.length));
      const maximum = Math.floor((TOP - BOTTOM - headerHeight - padding * 2) / LEADING);
      for (let offset = 0; offset < count; offset += maximum) {
        const length = Math.min(count - offset, maximum);
        const height = length * LEADING + padding * 2;
        if (this.y - height < BOTTOM) { this.addPage(); header(); }
        let x = MARGIN;
        cells.forEach((lines, index) => {
          lines.slice(offset, offset + length).forEach((line, number) => this.draw(line, x + padding, this.y - BODY - padding - number * LEADING));
          x += widths[index];
        });
        this.y -= height;
        this.rule(this.y);
      }
    }
    this.y -= 10;
  }

  private localSources(recommendation: RankedRecommendation): RecommendationSource[] {
    return this.payload.auditTrail.find(({ recommendationId }) => recommendationId === recommendation.id)?.sources ?? recommendation.sources;
  }

  private number(source: RecommendationSource): number | undefined {
    return this.sourceNumbers.get(referenceKey(source));
  }

  private citations(recommendation: RankedRecommendation, claim: EvidenceClaim): number[] {
    return [...new Set(claim.sourceReferences.flatMap((reference) => {
      const source = this.localSources(recommendation).find((source) => source.reference === reference.reference && source.chunkIndex === reference.chunkIndex && (reference.siloId === undefined || source.siloId === reference.siloId));
      const number = source ? this.number(source) : undefined;
      return number === undefined ? [] : [number];
    }))];
  }

  private addPage(): void {
    this.page = { commands: [], links: [] };
    this.pages.push(this.page);
    this.y = TOP;
  }

  private ensureSpace(height: number): void {
    if (this.y - height < BOTTOM) this.addPage();
  }

  private section(title: string, following = 45): void {
    this.ensureSpace(34 + following);
    this.y -= 10;
    this.draw(title, MARGIN, this.y - HEADING, { size: HEADING, font: "bold", color: GREEN });
    this.y -= 34;
  }

  private paragraph(value: string, style: TextStyle = {}, url?: string): void {
    const lines = this.wrap(value, CONTENT_WIDTH, style);
    const leading = style.size ? Math.ceil(style.size * 1.3) : LEADING;
    this.ensureSpace(Math.min(lines.length * leading + this.paragraphGap, TOP - BOTTOM));
    for (const line of lines) {
      this.ensureSpace(leading);
      const baseline = this.y - (style.size ?? BODY);
      this.draw(line, MARGIN, baseline, style);
      if (url) this.page.links.push({ url, rect: [MARGIN, baseline - 3, MARGIN + this.width(line, style), baseline + BODY] });
      this.y -= leading;
    }
    this.y -= this.paragraphGap;
  }

  private separator(): void {
    if (this.y - 13 < BOTTOM) return;
    this.y -= 3;
    this.rule(this.y);
    this.y -= 10;
  }

  private textHeight(value: string, style: TextStyle = {}): number {
    return this.wrap(value, CONTENT_WIDTH, style).length * LEADING;
  }

  private wrap(value: string, width: number, style: TextStyle = {}): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of cleanText(value).split(/\s+/)) {
      if (line && this.width(`${line} ${word}`, style) > width) { lines.push(line); line = ""; }
      for (const character of (line ? ` ${word}` : word)) {
        if (line && this.width(line + character, style) > width) { lines.push(line); line = ""; }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  private width(value: string, style: TextStyle = {}): number {
    return this.fonts[style.font ?? "regular"].width(value, style.size ?? BODY);
  }

  private draw(value: string, x: number, y: number, style: TextStyle = {}): void {
    const font = style.font ?? "regular";
    const content = cleanText(value);
    const left = style.right ? x - this.width(content, style) : x;
    this.page.commands.push(`BT\n${rgb(style.color ?? INK)} rg\n/${font === "bold" ? "F2" : "F1"} ${style.size ?? BODY} Tf\n${n(left)} ${n(y)} Td\n<${this.fonts[font].encode(content)}> Tj\nET`);
  }

  private rect(x: number, y: number, width: number, height: number, color: Rgb): void {
    this.page.commands.push(`q\n${rgb(color)} rg\n${n(x)} ${n(y)} ${n(width)} ${n(height)} re\nf\nQ`);
  }

  private rule(y: number): void {
    this.page.commands.push(`q\n${rgb(LINE)} RG\n0.5 w\n${n(MARGIN)} ${n(y)} m\n${n(PAGE_WIDTH - MARGIN)} ${n(y)} l\nS\nQ`);
  }

  private footers(): void {
    const current = this.page;
    this.pages.forEach((page, index) => {
      this.page = page;
      this.rule(44);
      this.draw("Kumpas · Generated as Draft. Approval recorded separately.", MARGIN, 30, { size: 9, color: MUTED });
      this.draw(`${index + 1} / ${this.pages.length}`, PAGE_WIDTH - MARGIN, 30, { size: 9, color: MUTED, right: true });
    });
    this.page = current;
  }

  private serialize(): Buffer {
    const objects: Buffer[] = [Buffer.alloc(0), Buffer.alloc(0)];
    const add = (body: string | Buffer): number => { objects.push(typeof body === "string" ? Buffer.from(body) : body); return objects.length; };
    const regular = this.fonts.regular.embed(add), bold = this.fonts.bold.embed(add);
    const pageIds = this.pages.map((page) => {
      const contents = add(pdfStream(Buffer.from(page.commands.join("\n"))));
      const annotations = page.links.map(({ url, rect }) => add(`<< /Type /Annot /Subtype /Link /Rect [${rect.map(n).join(" ")}] /Border [0 0 0] /A << /S /URI /URI (${escapeLiteral(url)}) >> >>`));
      return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${contents} 0 R${annotations.length ? ` /Annots [${annotations.map((id) => `${id} 0 R`).join(" ")}]` : ""} >>`);
    });
    objects[0] = Buffer.from("<< /Type /Catalog /Pages 2 0 R >>");
    objects[1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${this.pages.length} >>`);
    const parts = [Buffer.from(`%PDF-1.4\n${this.payload.studentSummary ? reportContentMarker(this.payload.reportVersion, this.payload.approvedProfileVersion) : ""}`)];
    const offsets = [0];
    let offset = parts[0].length;
    objects.forEach((object, index) => {
      const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]);
      offsets.push(offset); parts.push(part); offset += part.length;
    });
    parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
    return Buffer.concat(parts);
  }
}

function referenceKey(source: RecommendationSource): string {
  return JSON.stringify([source.title, source.publisher ?? null, sourceDate(source.publicationDate), publicSourceUrl(source.sourceUrl) ?? source.reference]);
}

function safeReference(value: string): string {
  if (/^file:\/\//i.test(value)) return `Local document: ${value.split(/[\\/]/).pop() || "unavailable"}`;
  if (/^https?:\/\//i.test(value)) return publicSourceUrl(value) ?? "Private or invalid URL withheld";
  return value;
}

function cleanText(value: string): string {
  return value.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/[\r\n\t]/g, " ").replace(/[\u0000-\u001f\u007f]/g, "");
}
function capitalize(value: string): string { return value[0].toUpperCase() + value.slice(1); }
function escapeLiteral(value: string): string { return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function n(value: number): string { return Number(value.toFixed(3)).toString(); }
function rgb(value: Rgb): string { return value.map(n).join(" "); }
function formatDate(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "unavailable";
}

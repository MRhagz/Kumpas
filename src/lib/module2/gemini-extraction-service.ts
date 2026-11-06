import "server-only";
import { randomUUID } from "node:crypto";
import { ProcessingBudget } from "@/lib/processing-budget";
import type { ExtractionDraft } from "@/types";
import type { AcademicUploadClaim } from "./academic-document-store";
import { EXTRACTION_PROMPT_VERSION, normalizeAcademicData } from "./extraction-contract";
import { intakeRpc } from "./intake-draft-store";
import { getGeminiGenerationModel, getGeminiResponseText, requestGeminiImageJson } from "@/lib/module3/gemini-config";

const SHAPES: Record<string, string> = {
  ncae: '{"strand_scores":{"<printed subscore name>":<number|null>},"overall_percentile":<number|null>,"recommended_strand":<string|null>}',
  form_137: '{"subjects":[{"name":"<subject>","grade":<number|null>,"year":"<school year>","grade_level":<string|null>}],"gwa":<number|null>,"school_year":<string|null>}',
  nat: '{"subjects":{"<printed subject>":<number|null>},"composite_score":<number|null>,"mastery_level":<string|null>}',
};

export class GeminiExtractionService {
  async extract(buffer: Buffer, docType: string, sessionId: string, counselorId: string, mimeType: string, claim: AcademicUploadClaim): Promise<ExtractionDraft> {
    const shape = SHAPES[docType];
    if (!shape) throw new Error("Unsupported document category");
    const budget = new ProcessingBudget();
    const response = await requestGeminiImageJson({
      contents: [{ parts: [
        { text: `Extract Philippine ${docType} academic evidence. Return exactly one JSON object:
{"evidence_state":"provided|unreadable|unsupported","data":${shape}}
Use provided only for the requested document category; use unsupported for a different category and unreadable when its academic content cannot be read.
Extract only printed values. Use null for missing, unsupported or unreadable values. Never invent scores, substitute zero, compute averages, or infer recommendations.
Form 137: use FINAL RATINGS only, never quarterly averages. Flatten all grade levels, retaining subject, grade level and school year. Retain identified subjects with missing final grades as null. GWA is null unless an overall document GWA is printed. Grades and GWA are 60–100; NCAE/NAT scores are 0–100.
Include no names, birthdates, IDs, addresses, school names or other personal identifiers. Return JSON only.` },
        { inlineData: { mimeType, data: buffer.toString("base64") } },
      ] }],
      generationConfig: { maxOutputTokens: 8192, responseMimeType: "application/json" },
    }, budget, "document extraction");
    let data;
    let evidence: ExtractionDraft["evidence_state"];
    try {
      const parsed = JSON.parse(getGeminiResponseText(response).replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim());
      evidence = parsed.evidence_state;
      if (!["provided", "unreadable", "unsupported"].includes(evidence)) throw new Error("Invalid evidence state");
      data = normalizeAcademicData(docType, evidence === "provided" ? parsed.data : {});
      if (data.type === "form_137") data.data.subjects = data.data.subjects.map((row) => ({ ...row, id: randomUUID() }));
    } catch {
      throw new Error("The extraction response was invalid. Retry or replace the document.");
    }
    budget.assert("document extraction");
    return intakeRpc<ExtractionDraft>("finish_academic_upload", {
      p_session_id: sessionId, p_counselor_id: counselorId, p_id: claim.id, p_token: claim.token,
      p_data: data, p_evidence: evidence,
      p_provenance: { documentId: claim.id, extractedAt: new Date().toISOString(), model: getGeminiGenerationModel(),
        promptVersion: EXTRACTION_PROMPT_VERSION, page: null },
    });
  }
}

export const geminiExtractionService = new GeminiExtractionService();

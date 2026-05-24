import { GoogleGenAI } from "@google/genai";
import { queryEmbeddingService } from "./query-embedding-service";
import { vectorStoreQueryService } from "./vector-store-query-service";
import type { AgentOutput, RetrievedChunk } from "./types";
import type { ApprovedProfile } from "@/types";

const AGENT_NAME = "FeasibilityStrategist" as const;

function buildQuery(profile: ApprovedProfile): string {
  const parts: string[] = [];

  parts.push(`Career goal: ${profile.counselorNotes.careerGoal}`);
  parts.push(`Financial situation: ${profile.counselorNotes.financial}`);

  if (profile.academicData.ncae?.recommended_strand) {
    parts.push(`Recommended strand: ${profile.academicData.ncae.recommended_strand}`);
  }

  if (profile.academicData.nat?.composite_score) {
    parts.push(`NAT composite score: ${profile.academicData.nat.composite_score}`);
  }

  if (profile.academicData.form137?.gwa) {
    parts.push(`GWA: ${profile.academicData.form137.gwa}`);
  }

  return `Philippine scholarships, CHED priority programs, and TESDA program costs for student: ${parts.join(". ")}`;
}

function buildPrompt(
  profile: ApprovedProfile,
  chunks: RetrievedChunk[],
): string {
  const context = chunks.map((c) => c.content).join("\n\n---\n\n");

  return `You are the Feasibility Strategist, a specialist career analysis agent. Your task is to analyze the financial feasibility of career paths for a Filipino student, using scholarship eligibility data from CHED Memorandum Orders and TESDA program cost benchmarks.

## Retrieved Scholarship and Cost Context
${context || "No relevant scholarship or cost data retrieved."}

## Student Profile Summary
Career Goal: ${profile.counselorNotes.careerGoal}
Financial Situation: ${profile.counselorNotes.financial}
Interests & Strengths: ${profile.counselorNotes.interests}
Concerns & Red Flags: ${profile.counselorNotes.concerns}
${profile.academicData.form137?.gwa ? `GWA: ${profile.academicData.form137.gwa}` : ""}
${profile.academicData.nat?.composite_score ? `NAT Composite: ${profile.academicData.nat.composite_score}` : ""}

## Instructions
Produce a structured feasibility analysis containing:
1. Eligible scholarship programs based on the student's academic standing and career goal
2. TESDA program options with estimated costs
3. Financial feasibility assessment given the student's stated family/financial situation
4. Cost barriers or financial risks the counselor should be aware of

Base your analysis EXCLUSIVELY on the retrieved context. Do not introduce external knowledge about scholarships or program costs.

Respond in JSON with this exact schema:
{
  "eligible_scholarships": ["scholarship1", ...],
  "tesda_options": [{ "program": "name", "estimated_cost": "PHP X" }],
  "feasibility_assessment": "high" | "moderate" | "low",
  "cost_barriers": ["barrier1", ...],
  "financial_risks": ["risk1", ...],
  "summary": "A 2-3 paragraph analysis synthesizing all findings"
}`;
}

export class FeasibilityStrategistAgent {
  async analyze(
    profile: ApprovedProfile,
    apiKey: string,
  ): Promise<AgentOutput> {
    const query = buildQuery(profile);
    const embedding = await queryEmbeddingService.embed(query, apiKey);
    const chunks = await vectorStoreQueryService.query(AGENT_NAME, embedding);

    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: buildPrompt(profile, chunks),
      config: { responseMimeType: "application/json" },
    });
    const text = result.text ?? "";

    return {
      agentName: AGENT_NAME,
      status: "SUCCESS",
      analysis: text,
      retrievedChunks: chunks,
    };
  }
}

export const feasibilityStrategistAgent = new FeasibilityStrategistAgent();

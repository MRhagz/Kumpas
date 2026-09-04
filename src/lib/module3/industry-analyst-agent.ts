import { GoogleGenAI } from "@google/genai";
import { AgentOperationError, runAgentStage } from "./agent-errors";
import {
  getGeminiGenerationModel,
  requireApiKey,
} from "./gemini-config";
import { queryEmbeddingService } from "./query-embedding-service";
import { vectorStoreQueryService } from "./vector-store-query-service";
import type { AgentOutput, RetrievedChunk } from "./types";
import type { ApprovedProfile } from "@/types";

const AGENT_NAME = "IndustryAnalyst" as const;

function buildQuery(profile: ApprovedProfile): string {
  const parts: string[] = [];

  parts.push(`Career goal: ${profile.counselorNotes.careerGoal}`);
  parts.push(`Interests and strengths: ${profile.counselorNotes.interests}`);

  if (profile.academicData.ncae?.recommended_strand) {
    parts.push(`Recommended SHS strand: ${profile.academicData.ncae.recommended_strand}`);
  }

  if (profile.academicData.ncae) {
    const topStrands = Object.entries(profile.academicData.ncae.strand_scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([strand]) => strand);
    parts.push(`Top NCAE strands: ${topStrands.join(", ")}`);
  }

  return `Philippine labor market demand and in-demand occupations for: ${parts.join(". ")}`;
}

function buildPrompt(
  profile: ApprovedProfile,
  chunks: RetrievedChunk[],
): string {
  const context = chunks.map((c) => c.content).join("\n\n---\n\n");

  return `You are the Industry Analyst, a specialist career analysis agent. Your task is to analyze current Philippine labor market demand and occupational outlook relevant to a student's career interests and academic profile, using DOLE BLE Labor Market Information.

## Retrieved Labor Market Context
${context || "No relevant labor market data retrieved."}

## Student Profile Summary
Career Goal: ${profile.counselorNotes.careerGoal}
Interests & Strengths: ${profile.counselorNotes.interests}
Financial Situation: ${profile.counselorNotes.financial}
${profile.academicData.ncae?.recommended_strand ? `Recommended Strand: ${profile.academicData.ncae.recommended_strand}` : ""}

## Instructions
Produce a structured labor market analysis containing:
1. In-demand occupations relevant to the student's career interests
2. Sector growth trends from the retrieved DOLE BLE data
3. Employment outlook signals (positive and cautionary)
4. Alignment between the student's stated career goal and current market demand

Base your analysis EXCLUSIVELY on the retrieved labor market context. Do not introduce external knowledge about job markets.

Respond in JSON with this exact schema:
{
  "in_demand_occupations": ["occupation1", "occupation2", ...],
  "sector_trends": ["trend1", "trend2", ...],
  "positive_outlook_signals": ["signal1", ...],
  "cautionary_signals": ["signal1", ...],
  "goal_market_alignment": "high" | "moderate" | "low",
  "summary": "A 2-3 paragraph analysis synthesizing all findings"
}`;
}

export class IndustryAnalystAgent {
  async analyze(
    profile: ApprovedProfile,
    apiKey: string,
  ): Promise<AgentOutput> {
    const normalizedApiKey = requireApiKey(AGENT_NAME, apiKey);
    const query = buildQuery(profile);
    const embedding = await runAgentStage(AGENT_NAME, "embedding", () =>
      queryEmbeddingService.embed(query, normalizedApiKey),
    );
    const chunks = await runAgentStage(AGENT_NAME, "knowledge retrieval", () =>
      vectorStoreQueryService.query(AGENT_NAME, embedding),
    );

    const ai = new GoogleGenAI({ apiKey: normalizedApiKey });

    const result = await runAgentStage(AGENT_NAME, "analysis generation", () =>
      ai.models.generateContent({
        model: getGeminiGenerationModel(),
        contents: buildPrompt(profile, chunks),
        config: { responseMimeType: "application/json" },
      }),
    );
    const text = result.text?.trim();

    if (!text) {
      throw new AgentOperationError(
        AGENT_NAME,
        "analysis generation",
        new Error("Gemini returned an empty response"),
      );
    }

    try {
      JSON.parse(text);
    } catch (error) {
      throw new AgentOperationError(AGENT_NAME, "analysis generation", error);
    }

    return {
      agentName: AGENT_NAME,
      status: "SUCCESS",
      analysis: text,
      retrievedChunks: chunks,
    };
  }
}

export const industryAnalystAgent = new IndustryAnalystAgent();

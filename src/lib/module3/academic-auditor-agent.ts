import { GoogleGenAI } from "@google/genai";
import { queryEmbeddingService } from "./query-embedding-service";
import { vectorStoreQueryService } from "./vector-store-query-service";
import type { AgentOutput, RetrievedChunk } from "./types";
import type { ApprovedProfile } from "@/types";

const AGENT_NAME = "AcademicAuditor" as const;

function buildQuery(profile: ApprovedProfile): string {
  const parts: string[] = [];

  if (profile.academicData.ncae) {
    const strands = Object.entries(profile.academicData.ncae.strand_scores)
      .sort(([, a], [, b]) => b - a)
      .map(([strand, score]) => `${strand}: ${score}`)
      .join(", ");
    parts.push(`NCAE strand scores: ${strands}`);
    if (profile.academicData.ncae.recommended_strand) {
      parts.push(`Recommended strand: ${profile.academicData.ncae.recommended_strand}`);
    }
  }

  if (profile.academicData.nat) {
    const subjects = Object.entries(profile.academicData.nat.subjects)
      .map(([subj, score]) => `${subj}: ${score}`)
      .join(", ");
    parts.push(`NAT subjects: ${subjects}`);
    if (profile.academicData.nat.composite_score) {
      parts.push(`NAT composite: ${profile.academicData.nat.composite_score}`);
    }
  }

  if (profile.academicData.form137) {
    const topSubjects = [...profile.academicData.form137.subjects]
      .sort((a, b) => b.grade - a.grade)
      .slice(0, 5)
      .map((s) => `${s.name}: ${s.grade}`)
      .join(", ");
    parts.push(`Top Form 137 subjects: ${topSubjects}`);
    if (profile.academicData.form137.gwa) {
      parts.push(`GWA: ${profile.academicData.form137.gwa}`);
    }
  }

  parts.push(`Career goal: ${profile.counselorNotes.careerGoal}`);
  parts.push(`Interests and strengths: ${profile.counselorNotes.interests}`);

  return `Philippine occupational employment demand for student with: ${parts.join(". ")}`;
}

function buildPrompt(
  profile: ApprovedProfile,
  chunks: RetrievedChunk[],
): string {
  const context = chunks.map((c) => c.content).join("\n\n---\n\n");

  return `You are the Academic Auditor, a specialist career analysis agent. Your task is to analyze a Filipino student's academic performance data and ground that analysis in occupational employment context retrieved from the PSA Labor Force Survey.

## Retrieved Occupational Employment Context
${context || "No relevant occupational data retrieved."}

## Student Academic Profile
${JSON.stringify(profile.academicData, null, 2)}

## Counselor Notes
Career Goal: ${profile.counselorNotes.careerGoal}
Interests & Strengths: ${profile.counselorNotes.interests}

## Instructions
Produce a structured academic analysis containing:
1. Aptitude signals derived from NCAE subscores, NAT composite, and Form 137 grades
2. Subject mastery patterns (strongest and weakest academic domains)
3. Observable strengths and weaknesses relevant to career alignment
4. Sector-level occupational demand signals from the retrieved context that align with the student's academic strengths

Base your analysis EXCLUSIVELY on the student data provided and the retrieved occupational employment context. Do not introduce external knowledge about job markets.

Respond in JSON with this exact schema:
{
  "aptitude_signals": ["signal1", "signal2", ...],
  "subject_mastery": { "strongest": ["subject1", ...], "weakest": ["subject1", ...] },
  "strengths": ["strength1", ...],
  "weaknesses": ["weakness1", ...],
  "occupational_demand_signals": ["signal1", "signal2", ...],
  "summary": "A 2-3 paragraph analysis synthesizing all findings"
}`;
}

export class AcademicAuditorAgent {
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

export const academicAuditorAgent = new AcademicAuditorAgent();

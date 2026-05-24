import { GoogleGenAI } from "@google/genai";
import type { AgentOutput, IntermediateSynthesis, SourceReference } from "./types";

function buildPrompt(agentOutputs: AgentOutput[]): string {
  const sections = agentOutputs.map((o) => {
    const chunkSources = o.retrievedChunks.map(
      (c) =>
        `- ${c.source_url} (${c.acquisition_method}, ingested ${c.ingestion_timestamp})`,
    );

    return `### ${o.agentName} (Status: ${o.status})
Analysis:
${o.analysis}

Retrieved Sources:
${chunkSources.length > 0 ? chunkSources.join("\n") : "None"}`;
  });

  return `You are the Synthesis Interpreter, a meta-agent that integrates insights from three specialist career analysis agents into a unified set of candidate career paths for a Filipino student.

## Specialist Agent Outputs
${sections.join("\n\n")}

## Instructions
Identify candidate career paths supported by the combined signals across all three agent dimensions. For each candidate, provide:
1. A career path name
2. Normalized dimension scores between 0.0 and 1.0:
   - aptitudeScore: how well the student's academic profile fits this career (from AcademicAuditor)
   - demandScore: how strong the labor market demand is for this career (from IndustryAnalyst)
   - feasibilityScore: how financially feasible this path is for the student (from FeasibilityStrategist)
3. The specific signals that substantiate each score
4. Source references from the retrieved knowledge base chunks

If an agent's status is FAILED, base the corresponding dimension score on the available data from other agents and note the limitation.

Produce at least 3 distinct candidate career paths.

Respond in JSON with this exact schema:
{
  "candidates": [
    {
      "careerPath": "string",
      "aptitudeScore": 0.0-1.0,
      "demandScore": 0.0-1.0,
      "feasibilityScore": 0.0-1.0,
      "signals": ["signal1", "signal2", ...],
      "sourceReferences": [
        {
          "title": "string",
          "reference": "source_url or description",
          "acquisitionMethod": "automated_csv | automated_pdf | operator_curated_csv | operator_curated_pdf | manual_curation",
          "ingestionTimestamp": "ISO timestamp",
          "relatedSignals": ["signal1", ...]
        }
      ]
    }
  ]
}`;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

export class SynthesisInterpreter {
  async synthesize(agentOutputs: AgentOutput[]): Promise<IntermediateSynthesis> {
    const apiKey = process.env.SYNTHESIS_API_KEY!;
    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: buildPrompt(agentOutputs),
      config: { responseMimeType: "application/json" },
    });
    const text = result.text ?? "";
    const parsed = JSON.parse(text) as {
      candidates: Array<{
        careerPath: string;
        aptitudeScore: number;
        demandScore: number;
        feasibilityScore: number;
        signals: string[];
        sourceReferences: SourceReference[];
      }>;
    };

    return {
      candidates: parsed.candidates.map((c) => ({
        ...c,
        aptitudeScore: clampScore(c.aptitudeScore),
        demandScore: clampScore(c.demandScore),
        feasibilityScore: clampScore(c.feasibilityScore),
        signals: c.signals ?? [],
        sourceReferences: c.sourceReferences ?? [],
      })),
    };
  }
}

export const synthesisInterpreter = new SynthesisInterpreter();

import { GoogleGenAI } from "@google/genai";
import type { ScoredCareerPath, RankedCareerPath } from "./types";

function buildPrompt(scoredPaths: ScoredCareerPath[]): string {
  const pathDescriptions = scoredPaths.map((p, i) => {
    return `${i + 1}. ${p.careerPath}
   Alignment Score: ${p.alignmentScore}
   Aptitude Fit: ${p.aptitudeScore}
   Market Demand: ${p.demandScore}
   Financial Feasibility: ${p.feasibilityScore}
   Key Signals: ${p.signals.join("; ")}`;
  });

  return `You are the Ranking Agent, responsible for generating plain-language Chain-of-Thought reasoning summaries for ranked career path recommendations for a Filipino student.

## Ranked Career Paths (in order of alignment score)
${pathDescriptions.join("\n\n")}

## Instructions
For each career path, generate a clear, counselor-friendly reasoning summary that:
1. Explains why this career path received its alignment score
2. Explicitly cites the signals that drove the ranking
3. Identifies any trade-offs or concerns the counselor should discuss with the student
4. Uses language a guidance counselor can communicate to a Grade 10 or SHS student

Do NOT modify the alignment scores or ranking order. Your role is to explain the ranking, not change it.

Respond in JSON with this exact schema:
{
  "rankings": [
    {
      "careerPath": "exact career path name from input",
      "reasoningSummary": "2-3 paragraph Chain-of-Thought explanation"
    }
  ]
}`;
}

export class RankingAgent {
  async generateReasoning(
    scoredPaths: ScoredCareerPath[],
  ): Promise<RankedCareerPath[]> {
    const apiKey = process.env.SYNTHESIS_API_KEY!;
    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: buildPrompt(scoredPaths),
      config: { responseMimeType: "application/json" },
    });
    const text = result.text ?? "";
    const parsed = JSON.parse(text) as {
      rankings: Array<{
        careerPath: string;
        reasoningSummary: string;
      }>;
    };

    const reasoningMap = new Map(
      parsed.rankings.map((r) => [r.careerPath, r.reasoningSummary]),
    );

    return scoredPaths.map((path) => ({
      ...path,
      reasoningSummary: reasoningMap.get(path.careerPath) ?? "",
    }));
  }
}

export const rankingAgent = new RankingAgent();

import { GoogleGenAI } from "@google/genai";
import { isSourceAcquisitionMethod } from "@/lib/report/types";
import {
  getGeminiGenerationModel,
  requireApiKey,
} from "./gemini-config";
import type {
  AgentOutput,
  IntermediateSynthesis,
  KeySignalDetail,
  SourceReference,
} from "./types";

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
4. Structured key signal rows suitable for a counselor-facing report UI
5. Source references from the retrieved knowledge base chunks

If an agent's status is FAILED, base the corresponding dimension score on the available data from other agents and note the limitation.

Produce at least 3 distinct candidate career paths.

For keySignalDetails:
- Use 3 to 5 rows.
- Use short counselor-readable labels such as "Academic Fit", "Labor Demand", "Financial Barrier", "Best Pathway", or "Career Awareness".
- value should be the bold main finding.
- subNote should briefly explain the evidence or caveat in one sentence.
- polarity must be "positive", "negative", or "neutral".

Respond in JSON with this exact schema:
{
  "candidates": [
    {
      "careerPath": "string",
      "aptitudeScore": 0.0-1.0,
      "demandScore": 0.0-1.0,
      "feasibilityScore": 0.0-1.0,
      "signals": ["signal1", "signal2", ...],
      "keySignalDetails": [
        {
          "label": "string",
          "value": "string",
          "subNote": "string",
          "polarity": "positive | negative | neutral"
        }
      ],
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

function normalizeKeySignalDetails(
  details: KeySignalDetail[] | undefined,
  fallbackSignals: string[],
): KeySignalDetail[] {
  const normalized = (details ?? [])
    .map((detail) => ({
      label: stripMarkdownEmphasis(String(detail.label ?? "")),
      value: stripMarkdownEmphasis(String(detail.value ?? "")),
      subNote: detail.subNote
        ? stripMarkdownEmphasis(String(detail.subNote))
        : undefined,
      polarity: normalizePolarity(detail.polarity),
    }))
    .filter((detail) => detail.label && detail.value);

  if (normalized.length > 0) {
    return normalized;
  }

  return fallbackSignals.slice(0, 5).map((signal, index) => ({
    label: `Signal ${index + 1}`,
    value: stripMarkdownEmphasis(signal),
    polarity: "neutral",
  }));
}

export function stripMarkdownEmphasis(value: string): string {
  return value
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{2,3}([^_]+)_{2,3}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function normalizePolarity(value: unknown): KeySignalDetail["polarity"] {
  if (value === "positive" || value === "negative" || value === "neutral") {
    return value;
  }

  return "neutral";
}

function normalizeSourceReferences(
  references: SourceReference[] | undefined,
): SourceReference[] {
  return (references ?? []).reduce<SourceReference[]>((acc, ref) => {
    const title = String(ref?.title ?? "").trim();
    const reference = String(ref?.reference ?? "").trim();
    const acquisitionMethod = String(ref?.acquisitionMethod ?? "").trim();

    if (!title || !reference || !isSourceAcquisitionMethod(acquisitionMethod)) {
      console.warn("[SynthesisInterpreter] dropping invalid sourceReference", {
        title,
        reference,
        acquisitionMethod,
      });
      return acc;
    }

    const ingestionTimestamp = String(ref?.ingestionTimestamp ?? "").trim();
    acc.push({
      title,
      reference,
      acquisitionMethod,
      ingestionTimestamp: Number.isNaN(Date.parse(ingestionTimestamp))
        ? new Date().toISOString()
        : ingestionTimestamp,
      relatedSignals: Array.isArray(ref?.relatedSignals)
        ? ref.relatedSignals.filter((s): s is string => typeof s === "string")
        : [],
    });
    return acc;
  }, []);
}

export class SynthesisInterpreter {
  async synthesize(agentOutputs: AgentOutput[]): Promise<IntermediateSynthesis> {
    const apiKey = requireApiKey(
      "SynthesisInterpreter",
      process.env.SYNTHESIS_API_KEY,
    );
    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: getGeminiGenerationModel(),
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
        keySignalDetails?: KeySignalDetail[];
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
        keySignalDetails: normalizeKeySignalDetails(
          c.keySignalDetails,
          c.signals ?? [],
        ),
        sourceReferences: normalizeSourceReferences(c.sourceReferences),
      })),
    };
  }
}

export const synthesisInterpreter = new SynthesisInterpreter();

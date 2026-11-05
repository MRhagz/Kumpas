import { ProcessingBudget } from "@/lib/processing-budget";
import { GoogleGenAI } from "@google/genai";

import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  assertEmbeddingConfiguration,
  assertEmbeddingVector,
} from "./embedding-contract";

export class QueryEmbeddingService {
  async embed(query: string, apiKey: string, budget = new ProcessingBudget()): Promise<number[]> {
    assertEmbeddingConfiguration();
    const ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });

    const result = await budget.run("query embedding", (signal) => ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: query,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_QUERY", abortSignal: signal },
    }));

    const embedding = result.embeddings?.[0]?.values;
    assertEmbeddingVector(embedding);

    return embedding;
  }
}

export const queryEmbeddingService = new QueryEmbeddingService();

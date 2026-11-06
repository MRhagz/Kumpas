import { createGeminiClient } from "./gemini-config";
import { ProcessingBudget } from "@/lib/processing-budget";

import {
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  assertEmbeddingConfiguration,
  assertEmbeddingVector,
} from "./embedding-contract";

export class QueryEmbeddingService {
  async embed(query: string, apiKey: string, budget = new ProcessingBudget()): Promise<number[]> {
    assertEmbeddingConfiguration();
    const ai = createGeminiClient(apiKey);

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

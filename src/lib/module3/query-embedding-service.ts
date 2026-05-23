import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSION = 768;

export class QueryEmbeddingService {
  async embed(query: string, apiKey: string): Promise<number[]> {
    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: query,
      config: { outputDimensionality: EMBEDDING_DIMENSION },
    });

    const embedding = result.embeddings?.[0]?.values;
    if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Expected ${EMBEDDING_DIMENSION}-dim embedding, got ${embedding?.length ?? 0}`,
      );
    }

    return embedding;
  }
}

export const queryEmbeddingService = new QueryEmbeddingService();

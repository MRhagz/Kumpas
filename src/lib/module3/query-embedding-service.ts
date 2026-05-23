import { GoogleGenerativeAI } from "@google/generative-ai";

const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_DIMENSION = 768;

export class QueryEmbeddingService {
  async embed(query: string, apiKey: string): Promise<number[]> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

    const result = await model.embedContent(query);
    const embedding = result.embedding.values;

    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Expected ${EMBEDDING_DIMENSION}-dim embedding, got ${embedding.length}`,
      );
    }

    return embedding;
  }
}

export const queryEmbeddingService = new QueryEmbeddingService();

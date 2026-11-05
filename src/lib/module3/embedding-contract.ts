export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

export function assertEmbeddingConfiguration(): void {
  const model = process.env.EMBEDDING_MODEL ?? EMBEDDING_MODEL;
  const dimensions = process.env.EMBEDDING_DIMENSIONS ?? String(EMBEDDING_DIMENSIONS);
  if (model !== EMBEDDING_MODEL || dimensions !== String(EMBEDDING_DIMENSIONS)) {
    throw new Error(
      `Incompatible embedding configuration: ingestion and query require ${EMBEDDING_MODEL} / ${EMBEDDING_DIMENSIONS}. Update both services and re-embed stored records before changing models.`,
    );
  }
}

export function assertEmbeddingVector(value: unknown): asserts value is number[] {
  if (
    !Array.isArray(value) ||
    value.length !== EMBEDDING_DIMENSIONS ||
    value.some((v) => typeof v !== "number" || !Number.isFinite(v))
  ) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS} finite embedding values`);
  }
}

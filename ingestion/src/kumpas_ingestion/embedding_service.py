from typing import Literal

import httpx

from .config import IngestionConfig

TaskType = Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]

_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class EmbeddingError(RuntimeError):
    pass


class EmbeddingService:
    """Embeds text using a Gemini embedding model.

    The query-time path in Module 3 MUST use the same model and the same
    outputDimensionality so stored and query vectors share the same space:
      - ingestion calls embed with task_type=RETRIEVAL_DOCUMENT
      - query-side calls embed with task_type=RETRIEVAL_QUERY

    Default model is gemini-embedding-001, which uses Matryoshka
    Representation Learning: the same model emits the requested dimension
    (768 here, matching the knowledge_chunks.embedding vector size).
    """

    def __init__(self, config: IngestionConfig, client: httpx.Client | None = None) -> None:
        self._config = config
        self._client = client or httpx.Client(timeout=30.0)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(text, task_type="RETRIEVAL_DOCUMENT") for text in texts]

    def _embed_one(self, text: str, task_type: TaskType) -> list[float]:
        url = (
            f"{_BASE_URL}/{self._config.embedding_model}:embedContent"
            f"?key={self._config.gemini_api_key}"
        )
        body = {
            "model": f"models/{self._config.embedding_model}",
            "content": {"parts": [{"text": text}]},
            "taskType": task_type,
            "outputDimensionality": self._config.embedding_dimensions,
        }
        response = self._client.post(url, json=body)
        if response.status_code != 200:
            raise EmbeddingError(
                f"Gemini embedding API returned {response.status_code}: {response.text}"
            )
        values = response.json().get("embedding", {}).get("values")
        if not values:
            raise EmbeddingError(f"Gemini response missing embedding.values: {response.text}")
        if len(values) != self._config.embedding_dimensions:
            raise EmbeddingError(
                f"Unexpected embedding dimension {len(values)}; "
                f"expected {self._config.embedding_dimensions}"
            )
        return values

    def close(self) -> None:
        self._client.close()

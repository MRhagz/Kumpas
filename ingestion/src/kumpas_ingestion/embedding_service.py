from typing import Literal

import httpx

from .config import IngestionConfig

TaskType = Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]

_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
_MAX_BATCH = 100


class EmbeddingError(RuntimeError):
    pass


class EmbeddingService:
    """Embeds text using the Gemini text-embedding-004 model.

    The query-time path in Module 3 also uses text-embedding-004 (per SDD 3.1).
    Both sides MUST use the same model and task-type semantics to keep query
    and stored vectors in a comparable space:
      - ingestion calls embed with task_type=RETRIEVAL_DOCUMENT
      - query-side calls embed with task_type=RETRIEVAL_QUERY
    """

    def __init__(self, config: IngestionConfig, client: httpx.Client | None = None) -> None:
        self._config = config
        self._client = client or httpx.Client(timeout=30.0)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed_batch(texts, task_type="RETRIEVAL_DOCUMENT")

    def _embed_batch(self, texts: list[str], task_type: TaskType) -> list[list[float]]:
        if not texts:
            return []
        embeddings: list[list[float]] = []
        for start in range(0, len(texts), _MAX_BATCH):
            window = texts[start : start + _MAX_BATCH]
            embeddings.extend(self._call_batch_embed(window, task_type))
        return embeddings

    def _call_batch_embed(self, texts: list[str], task_type: TaskType) -> list[list[float]]:
        url = (
            f"{_BASE_URL}/{self._config.embedding_model}:batchEmbedContents"
            f"?key={self._config.gemini_api_key}"
        )
        body = {
            "requests": [
                {
                    "model": f"models/{self._config.embedding_model}",
                    "content": {"parts": [{"text": text}]},
                    "taskType": task_type,
                }
                for text in texts
            ]
        }
        response = self._client.post(url, json=body)
        if response.status_code != 200:
            raise EmbeddingError(
                f"Gemini embedding API returned {response.status_code}: {response.text}"
            )
        payload = response.json()
        vectors = [item["values"] for item in payload.get("embeddings", [])]
        if len(vectors) != len(texts):
            raise EmbeddingError(
                f"Embedding count mismatch: requested {len(texts)}, got {len(vectors)}"
            )
        for vector in vectors:
            if len(vector) != self._config.embedding_dimensions:
                raise EmbeddingError(
                    f"Unexpected embedding dimension {len(vector)}; "
                    f"expected {self._config.embedding_dimensions}"
                )
        return vectors

    def close(self) -> None:
        self._client.close()

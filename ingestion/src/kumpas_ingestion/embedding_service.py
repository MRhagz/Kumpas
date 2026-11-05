import math
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
        try:
            response = self._client.post(url, json=body)
            response.raise_for_status()
            values = response.json()["embedding"]["values"]
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            # Provider error bodies and request URLs may contain credentials or source content.
            raise EmbeddingError("Gemini document embedding failed; check provider/configuration") from exc
        if not isinstance(values, list) or len(values) != self._config.embedding_dimensions:
            raise EmbeddingError(
                f"Expected {self._config.embedding_dimensions}-dimensional document embedding"
            )
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
               for v in values):
            raise EmbeddingError("Document embedding must contain finite numbers")
        return values

    def close(self) -> None:
        self._client.close()

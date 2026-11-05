import hashlib
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, computed_field, field_validator, model_validator

from .config import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL
from .silos import SiloId

AcquisitionMethod = Literal[
    "automated_csv",
    "automated_pdf",
    "manual_curation",
    "operator_curated_csv",
    "operator_curated_pdf",
]
RunStatus = Literal["success", "no_op", "failure"]


SourceType = Literal["psa_openstat_lfs", "dole_ble_lmi", "ched_cmo", "tesda_manual"]
SOURCE_CONTRACT = {
    "psa_openstat_lfs": (SiloId.MARKET_ANALYTICS, "operator_curated_csv"),
    "dole_ble_lmi": (SiloId.LIVE_LABOR_DEMAND, "operator_curated_pdf"),
    "ched_cmo": (SiloId.PATH_FEASIBILITY, "automated_pdf"),
    "tesda_manual": (SiloId.PATH_FEASIBILITY, "manual_curation"),
}


class ChunkInput(BaseModel):
    """Stable record identity is (silo_id, source_url, chunk_index)."""

    silo_id: SiloId
    source_type: SourceType
    source_url: str = Field(min_length=1)
    chunk_index: int = Field(ge=0)
    content: str = Field(min_length=1)
    acquisition_method: AcquisitionMethod
    official_source_url: str | None = None
    publication_date: date | None = None
    source_metadata: dict = Field(default_factory=dict)

    @field_validator("source_url", "content")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value

    @field_validator("official_source_url")
    @classmethod
    def _official_url(cls, value: str | None) -> str | None:
        if value is not None:
            if HttpUrl(value).scheme != "https":
                raise ValueError("official_source_url must be an official HTTPS URL or unavailable")
        return value

    @model_validator(mode="after")
    def _source_contract(self) -> "ChunkInput":
        if (self.silo_id, self.acquisition_method) != SOURCE_CONTRACT[self.source_type]:
            raise ValueError(f"Invalid silo/acquisition method for {self.source_type}")
        return self

    @property
    def key(self) -> tuple[str, str, int]:
        return (self.silo_id.value, self.source_url, self.chunk_index)

    @computed_field
    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.content.encode("utf-8")).hexdigest()


class KnowledgeChunk(ChunkInput):
    """Validated document vector and its embedding-space fingerprint."""

    embedding: list[float] = Field(
        min_length=EMBEDDING_DIMENSIONS, max_length=EMBEDDING_DIMENSIONS
    )
    embedding_model: Literal["gemini-embedding-001"] = EMBEDDING_MODEL
    embedding_dimensions: Literal[768] = EMBEDDING_DIMENSIONS
    ingestion_timestamp: datetime | None = None

    @field_validator("embedding", mode="before")
    @classmethod
    def _finite_vector(cls, value: object) -> object:
        import math

        if not isinstance(value, list) or any(
            isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
            for v in value
        ):
            raise ValueError("embedding must contain finite numbers")
        return value


class IngestionLogEntry(BaseModel):
    workflow_name: str
    silo_id: SiloId | None = None
    run_status: RunStatus
    started_at: datetime
    finished_at: datetime | None = None
    records_upserted: int = 0
    error_message: str | None = None
    run_metadata: dict = Field(default_factory=dict)

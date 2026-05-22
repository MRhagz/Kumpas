import hashlib
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from .silos import SiloId

AcquisitionMethod = Literal["automated_csv", "automated_pdf", "manual_curation"]
RunStatus = Literal["success", "no_op", "failure"]


class ChunkInput(BaseModel):
    """A chunk before embedding. Carries enough metadata to produce a KnowledgeChunk."""

    silo_id: SiloId
    source_url: str
    chunk_index: int
    content: str
    acquisition_method: AcquisitionMethod
    source_metadata: dict = Field(default_factory=dict)

    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.content.encode("utf-8")).hexdigest()


class KnowledgeChunk(BaseModel):
    """A chunk ready to be written to the knowledge_chunks table."""

    silo_id: SiloId
    source_url: str
    chunk_index: int
    content: str
    content_hash: str
    embedding: list[float]
    acquisition_method: AcquisitionMethod
    source_metadata: dict = Field(default_factory=dict)
    ingestion_timestamp: datetime | None = None


class IngestionLogEntry(BaseModel):
    workflow_name: str
    silo_id: SiloId | None = None
    run_status: RunStatus
    started_at: datetime
    finished_at: datetime | None = None
    records_upserted: int = 0
    error_message: str | None = None
    run_metadata: dict = Field(default_factory=dict)

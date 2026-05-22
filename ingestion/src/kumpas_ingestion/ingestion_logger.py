import logging
import sys
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from .models import IngestionLogEntry, RunStatus
from .silos import SiloId

_stdout_logger = logging.getLogger("kumpas.ingestion")
if not _stdout_logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    _stdout_logger.addHandler(handler)
    _stdout_logger.setLevel(logging.INFO)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class IngestionLogger:
    """Writes structured run records to ingestion_logs and mirrors them to stdout.

    Stdout output makes failures visible in GitHub Actions logs; the database row
    is the source of truth surfaced to the counselor UI as a freshness indicator.
    """

    def __init__(self, supabase: Client, workflow_name: str) -> None:
        self._supabase = supabase
        self._workflow_name = workflow_name
        self._started_at: datetime | None = None

    def start(self, silo_id: SiloId | None = None) -> None:
        self._started_at = _utcnow()
        _stdout_logger.info(
            "starting workflow=%s silo=%s", self._workflow_name, silo_id or "n/a"
        )
        self._current_silo = silo_id

    def record(
        self,
        run_status: RunStatus,
        records_upserted: int = 0,
        error_message: str | None = None,
        run_metadata: dict[str, Any] | None = None,
    ) -> str:
        if self._started_at is None:
            raise RuntimeError("IngestionLogger.start() must be called before record()")
        entry = IngestionLogEntry(
            workflow_name=self._workflow_name,
            silo_id=self._current_silo,
            run_status=run_status,
            started_at=self._started_at,
            finished_at=_utcnow(),
            records_upserted=records_upserted,
            error_message=error_message,
            run_metadata=run_metadata or {},
        )
        result = (
            self._supabase.table("ingestion_logs")
            .insert(_serialize(entry))
            .execute()
        )
        log_id = result.data[0]["log_id"]
        _stdout_logger.info(
            "workflow=%s status=%s records=%d log_id=%s",
            self._workflow_name,
            run_status,
            records_upserted,
            log_id,
        )
        if error_message:
            _stdout_logger.error("error: %s", error_message)
        return log_id


def _serialize(entry: IngestionLogEntry) -> dict[str, Any]:
    payload = entry.model_dump()
    payload["started_at"] = entry.started_at.isoformat()
    if entry.finished_at:
        payload["finished_at"] = entry.finished_at.isoformat()
    return payload

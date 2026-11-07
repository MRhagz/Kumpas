import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

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
    return datetime.now(UTC)


class IngestionLogger:
    """Writes structured run records to ingestion_logs and mirrors them to stdout.

    Stdout output makes failures visible in GitHub Actions logs; the database row
    is the source of truth surfaced to the counselor UI as a freshness indicator.
    """

    def __init__(self, supabase: Client, workflow_name: str) -> None:
        self._supabase = supabase
        self._workflow_name = workflow_name if workflow_name in {"psa_openstat_lfs", "ched_cmo_pdf", "dole_ble_lmi_pdf", "tesda_manual_curation"} else "unknown"
        self._run_id = str(uuid4())
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
        payload = self.prepare(run_status, records_upserted, error_message, run_metadata)
        log_id = str(uuid4())
        payload["log_id"] = log_id
        try:
            (
                self._supabase.table("ingestion_logs")
                .insert(payload, returning="minimal")
                .execute()
            )
        except Exception:  # noqa: BLE001 -- sanitize failures at the operational boundary
            _stdout_logger.error("log_write_failed run_id=%s", self._run_id)
            raise RuntimeError("Operational log write failed") from None
        _stdout_logger.info(
            "workflow=%s status=%s records=%d log_id=%s",
            self._workflow_name,
            run_status,
            records_upserted,
            self._run_id,
        )
        if error_message:
            _stdout_logger.error("ingestion_failed run_id=%s", self._run_id)
        return log_id

    def prepare(
        self,
        run_status: RunStatus = "success",
        records_upserted: int = 0,
        error_message: str | None = None,
        run_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Prepare a success log for the refresh transaction without writing it early."""
        if self._started_at is None:
            raise RuntimeError("IngestionLogger.start() must be called before record()")
        entry = IngestionLogEntry(
            workflow_name=self._workflow_name,
            silo_id=self._current_silo,
            run_status=run_status,
            started_at=self._started_at,
            finished_at=_utcnow(),
            records_upserted=records_upserted,
            error_message="ingestion_failed" if error_message or run_status == "failure" else None,
            run_metadata={
                **{k: v for k, v in (run_metadata or {}).items()
                   if k in SAFE_COUNT_FIELDS and type(v) is int and 0 <= v <= 2**31 - 1},
                "run_id": self._run_id,
                "duration_ms": max(0, int((_utcnow() - self._started_at).total_seconds() * 1000)),
            },
        )
        payload = _serialize(entry)
        _stdout_logger.info("stage=prepared operational_event %s", json.dumps(payload))
        return payload


def _serialize(entry: IngestionLogEntry) -> dict[str, Any]:
    payload = entry.model_dump()
    payload["started_at"] = entry.started_at.isoformat()
    if entry.finished_at:
        payload["finished_at"] = entry.finished_at.isoformat()
    return payload


SAFE_COUNT_FIELDS = frozenset({
    "target_year", "index_size", "already_ingested", "publications_processed",
    "publications_failed", "total_records", "files_processed", "files_failed",
    "inserted", "updated", "skipped_unchanged", "removed",
})


def run_cli(operation):
    """Prevent uncaught provider/config exceptions from printing raw tracebacks."""
    try:
        return operation()
    except Exception:  # noqa: BLE001 -- sanitize failures at the operational boundary
        _stdout_logger.error("ingestion_failed run_id=%s", uuid4())
        return 1

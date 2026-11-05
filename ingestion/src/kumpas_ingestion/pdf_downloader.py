"""HTTPS PDF downloader used by Module 1.2 pipelines.

Accepts both https://... URLs (CHED automated path) and file://... paths
(operator-curated DOLE BLE path and offline test fixtures). On non-200
responses or non-PDF content types it raises PDFDownloadError so the
pipeline can record the failure to ingestion_logs without partial writes.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import url2pathname

import httpx


class PDFDownloadError(RuntimeError):
    pass


class PDFDownloader:
    """Streams PDF bytes from a publication URL.

    Does not extract or transform; the pipeline hands the raw bytes off
    to PDFTextExtractor. file:// is supported so the same downloader
    serves CHED (network) and DOLE BLE (repo-checked-in) callers.
    """

    def __init__(self, client: httpx.Client | None = None, timeout: float = 60.0) -> None:
        self._client = client or httpx.Client(timeout=timeout, follow_redirects=True)

    def download(self, url: str) -> bytes:
        if url.startswith("file://"):
            parts = urlsplit(url)
            if parts.netloc not in ("", "localhost") or parts.query or parts.fragment:
                raise PDFDownloadError("Expected a local file URI without query or fragment")
            return self._read_file(url2pathname(parts.path))
        return self._read_http(url)

    def _read_file(self, path: str) -> bytes:
        location = Path(path)
        try:
            return location.read_bytes()
        except OSError as exc:
            raise PDFDownloadError(f"Cannot read local PDF {location}: {exc}") from exc

    def _read_http(self, url: str) -> bytes:
        try:
            response = self._client.get(url)
        except httpx.HTTPError as exc:
            raise PDFDownloadError(f"HTTP error fetching {url}: {exc}") from exc
        if response.status_code != 200:
            raise PDFDownloadError(
                f"PDF download returned HTTP {response.status_code} for {url}"
            )
        ctype = response.headers.get("content-type", "")
        if "pdf" not in ctype.lower():
            raise PDFDownloadError(
                f"Expected application/pdf for {url}, got content-type={ctype!r}"
            )
        return response.content

    def close(self) -> None:
        self._client.close()

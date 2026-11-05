"""HTTPS PDF downloader used by Module 1.2 pipelines.

Accepts both https://... URLs (CHED automated path) and file://... paths
(operator-curated DOLE BLE path and offline test fixtures). On non-200
responses or non-PDF content types it raises PDFDownloadError so the
pipeline can record the failure to ingestion_logs without partial writes.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx


class PDFDownloadError(RuntimeError):
    pass


def is_allowed_https_url(url: str, allowed_hosts: frozenset[str]) -> bool:
    try:
        parts = urlsplit(url)
        return (parts.scheme == "https" and parts.hostname in allowed_hosts
                and parts.port in (None, 443) and parts.username is None
                and parts.password is None)
    except ValueError:
        return False


class PDFDownloader:
    """Streams PDF bytes from a publication URL.

    Does not extract or transform; the pipeline hands the raw bytes off
    to PDFTextExtractor. file:// is supported so the same downloader
    serves CHED (network) and DOLE BLE (repo-checked-in) callers.
    """

    def __init__(
        self, client: httpx.Client | None = None, timeout: float = 60.0,
        allowed_hosts: frozenset[str] | None = None,
    ) -> None:
        self._client = client or httpx.Client(timeout=timeout, follow_redirects=True)
        self._allowed_hosts = allowed_hosts

    def download(self, url: str) -> bytes:
        if self._allowed_hosts is not None and not is_allowed_https_url(url, self._allowed_hosts):
            raise PDFDownloadError(f"Publication is not on an allowed public HTTPS host: {url}")
        if url.startswith("file://"):
            return self._read_file(url.removeprefix("file://"))
        return self._read_http(url)

    def _read_file(self, path: str) -> bytes:
        location = Path(path)
        if not location.exists():
            raise PDFDownloadError(f"Local PDF not found at {location}")
        return location.read_bytes()

    def _read_http(self, url: str) -> bytes:
        try:
            if self._allowed_hosts is None:
                response = self._client.get(url)
            else:
                # Check every redirect BEFORE requesting it; an official index is
                # not permission to fetch arbitrary destinations or local files.
                for _ in range(11):
                    if not is_allowed_https_url(url, self._allowed_hosts):
                        raise PDFDownloadError(f"Publication redirects outside allowed HTTPS hosts: {url}")
                    response = self._client.get(url, follow_redirects=False)
                    if not response.has_redirect_location:
                        break
                    url = urljoin(url, response.headers["location"])
                else:
                    raise PDFDownloadError("Too many publication redirects")
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

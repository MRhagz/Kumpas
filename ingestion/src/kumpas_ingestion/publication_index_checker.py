"""PublicationIndexChecker for Module 1.2 CHED CMO ingestion.

Scrapes the legacy CHED Memorandum Order yearly index pages at
`https://legacy.ched.gov.ph/{year}-ched-memorandum-orders/`. The current
ched.gov.ph site sits behind a CDN that returns 403 to non-browser
clients, but the legacy WordPress mirror responds normally with a stable
DOM:

    <div class="entry-content">
      <table>
        <tr><td><a href=".../CMO-No.-1-s.-2025.pdf">CMO No. 1, series of 2025 – ...</a></td></tr>
        ...
      </table>
    </div>

We filter anchors whose href ends in `.pdf` and whose visible text begins
with the literal `CMO No.` token, parsing the CMO number, year, and
title from the anchor text. PDFs not matching that pattern (sidebar
brochures, generic LEP data, etc.) are ignored.

DOLE BLE is intentionally absent here. The BLE site is CDN-blocked the
same way ched.gov.ph (non-legacy) is, so DOLE LMI uses the operator-
curated drop in `ingestion/data/dole_ble/`, mirroring the PSA pivot in
Module 1.1.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

CHED_LEGACY_BASE = "https://legacy.ched.gov.ph"
CHED_YEAR_INDEX_TEMPLATE = CHED_LEGACY_BASE + "/{year}-ched-memorandum-orders/"

_CMO_ANCHOR_RE = re.compile(
    r"^\s*CMO\s*No\.?\s*(?P<number>\d+)[^,]*,\s*series\s+of\s+(?P<year>\d{4})\s*[-–—]\s*(?P<title>.+)$",
    re.IGNORECASE,
)


class IndexCheckError(RuntimeError):
    pass


@dataclass(frozen=True)
class PublicationEntry:
    publication_url: str
    cmo_number: int
    year: int
    title: str

    @property
    def display_label(self) -> str:
        return f"CMO No. {self.cmo_number}, s. {self.year}"


class PublicationIndexChecker:
    """Detects CHED CMO PDFs newly published in a target year.

    Returns at most `limit` entries (first-run scope cap from the SDD;
    user-set default is 10 per source). The caller compares the returned
    URLs against publication_index_cache to identify which are net-new.
    """

    def __init__(
        self,
        client: httpx.Client | None = None,
        timeout: float = 30.0,
    ) -> None:
        self._client = client or httpx.Client(
            timeout=timeout,
            follow_redirects=True,
            headers={"User-Agent": "Kumpas-Ingestion/0.1 (+github-actions)"},
        )

    def list_year(self, year: int, limit: int | None = None) -> list[PublicationEntry]:
        url = CHED_YEAR_INDEX_TEMPLATE.format(year=year)
        html = self._fetch_html(url)
        entries = self._parse_entries(html)
        entries.sort(key=lambda e: e.cmo_number, reverse=True)
        if limit is not None:
            entries = entries[:limit]
        return entries

    def _fetch_html(self, url: str) -> str:
        try:
            response = self._client.get(url)
        except httpx.HTTPError as exc:
            raise IndexCheckError(f"HTTP error fetching {url}: {exc}") from exc
        if response.status_code == 404:
            return ""
        if response.status_code != 200:
            raise IndexCheckError(
                f"CHED index returned HTTP {response.status_code} for {url}"
            )
        return response.text

    def _parse_entries(self, html: str) -> list[PublicationEntry]:
        if not html:
            return []
        soup = BeautifulSoup(html, "html.parser")
        content = soup.find("div", class_="entry-content")
        if content is None:
            return []
        seen: set[str] = set()
        entries: list[PublicationEntry] = []
        for anchor in content.find_all("a"):
            href = (anchor.get("href") or "").strip()
            if not href.lower().endswith(".pdf"):
                continue
            text = " ".join(anchor.get_text(" ", strip=True).split())
            match = _CMO_ANCHOR_RE.match(text)
            if not match:
                continue
            absolute_href = href if href.startswith("http") else CHED_LEGACY_BASE + href
            if absolute_href in seen:
                continue
            seen.add(absolute_href)
            entries.append(
                PublicationEntry(
                    publication_url=absolute_href,
                    cmo_number=int(match.group("number")),
                    year=int(match.group("year")),
                    title=match.group("title").strip(),
                )
            )
        return entries

    def close(self) -> None:
        self._client.close()

"""Strips headers, footers, and page-number noise from extracted PDF text.

The SDD calls for a regex-based cleaner with rules configurable per
source type (DOLE vs CHED). Both bureaus' publications share several
predictable artifacts: page-number lines (`Page 3 of 12`, `- 4 -`,
bare-digit footers), recurring header phrases (the ministry's own
name, document-reference banners), and hyphenation across page breaks.

Strategy:
  1. Split the document on form-feed page separators emitted by
     PDFTextExtractor.
  2. For each page, apply a set of line-level regex filters drawn from
     the chosen profile (CHED or DOLE_BLE).
  3. Detect repeated header/footer lines that appear on >=60% of pages
     and drop them — this catches arbitrary running banners without
     hard-coding the wording.
  4. Repair end-of-line hyphenation across pages.
  5. Re-join, collapsing runs of blank lines.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Pattern

_PAGE_NUMBER_PATTERNS: list[Pattern[str]] = [
    re.compile(r"^\s*page\s+\d+(\s+of\s+\d+)?\s*$", re.IGNORECASE),
    re.compile(r"^\s*-\s*\d+\s*-\s*$"),
    re.compile(r"^\s*\d+\s*$"),
]

_TRAILING_HYPHEN = re.compile(r"(\w+)-\s*\Z")
_LEADING_WORD = re.compile(r"^\s*(\w+)")
_MULTI_BLANK = re.compile(r"\n{3,}")


@dataclass(frozen=True)
class CleanerProfile:
    name: str
    drop_patterns: tuple[Pattern[str], ...] = ()
    header_repetition_threshold: float = 0.6


CHED_PROFILE = CleanerProfile(
    name="ched",
    drop_patterns=(
        re.compile(r"^\s*commission on higher education\s*$", re.IGNORECASE),
        re.compile(r"^\s*republic of the philippines\s*$", re.IGNORECASE),
        re.compile(r"^\s*ched memorandum order.*", re.IGNORECASE),
    ),
)

DOLE_BLE_PROFILE = CleanerProfile(
    name="dole_ble",
    drop_patterns=(
        re.compile(r"^\s*department of labor and employment\s*$", re.IGNORECASE),
        re.compile(r"^\s*bureau of local employment\s*$", re.IGNORECASE),
        re.compile(r"^\s*republic of the philippines\s*$", re.IGNORECASE),
    ),
)


@dataclass
class TextCleaner:
    profile: CleanerProfile = field(default=CHED_PROFILE)

    def clean(self, text: str) -> str:
        if not text:
            return ""
        pages = text.split("\f") if "\f" in text else [text]
        page_lines = [self._strip_obvious_noise(p) for p in pages]
        page_lines = self._drop_repeated_running_lines(page_lines)
        joined = self._join_with_hyphen_repair(page_lines)
        return _MULTI_BLANK.sub("\n\n", joined).strip()

    def _strip_obvious_noise(self, page: str) -> list[str]:
        cleaned: list[str] = []
        for raw in page.splitlines():
            line = raw.rstrip()
            if not line:
                cleaned.append("")
                continue
            if any(p.match(line) for p in _PAGE_NUMBER_PATTERNS):
                continue
            if any(p.match(line) for p in self.profile.drop_patterns):
                continue
            cleaned.append(line)
        return cleaned

    def _drop_repeated_running_lines(self, pages: list[list[str]]) -> list[list[str]]:
        if len(pages) < 3:
            return pages
        threshold = max(2, int(len(pages) * self.profile.header_repetition_threshold))
        candidates: Counter[str] = Counter()
        for lines in pages:
            seen_on_page: set[str] = set()
            for position in (0, 1, -2, -1):
                if not lines:
                    continue
                if not -len(lines) <= position < len(lines):
                    continue
                line = lines[position].strip()
                if 3 <= len(line) <= 120 and line not in seen_on_page:
                    candidates[line] += 1
                    seen_on_page.add(line)
        running = {line for line, count in candidates.items() if count >= threshold}
        if not running:
            return pages
        return [[line for line in page if line.strip() not in running] for page in pages]

    def _join_with_hyphen_repair(self, pages: list[list[str]]) -> str:
        parts: list[str] = []
        for lines in pages:
            text = "\n".join(line for line in lines if line is not None)
            if parts:
                prev = parts[-1].rstrip()
                match = _TRAILING_HYPHEN.search(prev)
                if match:
                    head_match = _LEADING_WORD.match(text)
                    if head_match:
                        spliced = match.group(1) + head_match.group(1)
                        parts[-1] = prev[: match.start()] + spliced
                        text = text[head_match.end() :]
            parts.append(text)
        return "\n".join(parts)

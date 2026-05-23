"""Wraps pdfplumber for spatial-aware text extraction.

pdfplumber was chosen over Node alternatives (pdf-parse, pdfjs-dist)
because Philippine government publications routinely use multi-column
layouts that the JS libraries flatten incorrectly. Module 1.2 must
therefore stay a Python pipeline; see SDD §Module 1.2 / PDFTextExtractor.

Returned text is the concatenation of per-page text with form-feed
separators (\\f) so TextCleaner can detect page boundaries when
stripping running headers/footers.
"""

from __future__ import annotations

import io

import pdfplumber


class PDFTextExtractionError(RuntimeError):
    pass


class PDFTextExtractor:
    def extract(self, pdf_bytes: bytes) -> str:
        if not pdf_bytes:
            raise PDFTextExtractionError("empty PDF bytes")
        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                pages = [page.extract_text() or "" for page in pdf.pages]
        except Exception as exc:
            raise PDFTextExtractionError(f"pdfplumber failed: {exc}") from exc
        return "\f".join(pages)

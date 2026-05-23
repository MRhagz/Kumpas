"""Wraps pdfplumber for spatial-aware text extraction, with OCR fallback.

pdfplumber was chosen over Node alternatives (pdf-parse, pdfjs-dist)
because Philippine government publications routinely use multi-column
layouts that the JS libraries flatten incorrectly. Module 1.2 must
therefore stay a Python pipeline; see SDD §Module 1.2 / PDFTextExtractor.

Returned text is the concatenation of per-page text with form-feed
separators (\\f) so TextCleaner can detect page boundaries when
stripping running headers/footers.

OCR fallback. CHED Memorandum Orders (and many other Philippine
government documents) are PDF scans of physically signed pages with no
embedded text layer — pdfplumber returns the empty string for these.
When the initial pdfplumber pass averages fewer than `ocr_min_chars_per_page`
characters per page, we run the PDF through `ocrmypdf` (tesseract under
the hood) to produce a text-layered PDF, then re-extract via pdfplumber.
The fallback is opt-out via `enable_ocr=False` so unit tests that only
care about the text-layer path don't pay the OCR cost or require the
tesseract binary.
"""

from __future__ import annotations

import io
import logging
import tempfile
from pathlib import Path

import pdfplumber

_DEFAULT_OCR_MIN_CHARS_PER_PAGE = 50

_logger = logging.getLogger("kumpas.ingestion.pdf_extract")


class PDFTextExtractionError(RuntimeError):
    pass


class PDFTextExtractor:
    """Extracts text from a PDF, with an opt-in OCR fallback for scans.

    Two-stage pipeline:
      1. pdfplumber pass on the input bytes (cheap, no system deps).
      2. If avg characters per page < ocr_min_chars_per_page AND OCR is
         enabled, run ocrmypdf to add a tesseract text layer, then re-run
         pdfplumber on the resulting bytes.

    The OCR fallback raises PDFTextExtractionError if ocrmypdf or
    tesseract isn't available so callers can record a clear failure to
    the ingestion log instead of silently producing empty chunks.
    """

    def __init__(
        self,
        enable_ocr: bool = True,
        ocr_min_chars_per_page: int = _DEFAULT_OCR_MIN_CHARS_PER_PAGE,
        ocr_language: str = "eng",
    ) -> None:
        self._enable_ocr = enable_ocr
        self._ocr_min_chars_per_page = ocr_min_chars_per_page
        self._ocr_language = ocr_language

    def extract(self, pdf_bytes: bytes) -> str:
        if not pdf_bytes:
            raise PDFTextExtractionError("empty PDF bytes")

        text, page_count = self._extract_with_pdfplumber(pdf_bytes)
        if not self._needs_ocr(text, page_count):
            return text
        if not self._enable_ocr:
            _logger.warning(
                "pdfplumber returned sparse text (chars=%d pages=%d) but OCR is disabled",
                len(text),
                page_count,
            )
            return text

        _logger.info(
            "pdfplumber sparse (chars=%d pages=%d) — running OCR fallback",
            len(text),
            page_count,
        )
        ocr_bytes = self._ocr_pdf(pdf_bytes)
        ocr_text, _ = self._extract_with_pdfplumber(ocr_bytes)
        if not ocr_text.strip():
            raise PDFTextExtractionError(
                "OCR fallback produced no text — PDF may be unreadable"
            )
        return ocr_text

    def _extract_with_pdfplumber(self, pdf_bytes: bytes) -> tuple[str, int]:
        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                pages = [page.extract_text() or "" for page in pdf.pages]
        except Exception as exc:
            raise PDFTextExtractionError(f"pdfplumber failed: {exc}") from exc
        return "\f".join(pages), len(pages)

    def _needs_ocr(self, text: str, page_count: int) -> bool:
        if page_count == 0:
            return False
        avg_chars = len(text) / page_count
        return avg_chars < self._ocr_min_chars_per_page

    def _ocr_pdf(self, pdf_bytes: bytes) -> bytes:
        try:
            import ocrmypdf  # noqa: PLC0415  (deferred so non-OCR users skip the dep)
        except ImportError as exc:
            raise PDFTextExtractionError(
                "OCR fallback required but ocrmypdf is not installed. "
                "Install with: pip install -e '.[pdf]' (includes ocrmypdf>=16)."
            ) from exc

        with tempfile.TemporaryDirectory(prefix="kumpas-ocr-") as tmp:
            in_path = Path(tmp) / "in.pdf"
            out_path = Path(tmp) / "out.pdf"
            in_path.write_bytes(pdf_bytes)
            try:
                ocrmypdf.ocr(
                    str(in_path),
                    str(out_path),
                    language=self._ocr_language,
                    skip_text=True,
                    progress_bar=False,
                    use_threads=True,
                    output_type="pdf",
                    optimize=0,
                )
            except ocrmypdf.exceptions.MissingDependencyError as exc:
                raise PDFTextExtractionError(
                    "OCR fallback needs the tesseract binary. Install with: "
                    "sudo apt install tesseract-ocr tesseract-ocr-eng poppler-utils ghostscript"
                ) from exc
            except Exception as exc:
                raise PDFTextExtractionError(f"ocrmypdf failed: {exc}") from exc
            return out_path.read_bytes()

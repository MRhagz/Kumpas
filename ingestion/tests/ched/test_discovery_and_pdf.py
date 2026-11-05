"""I08/I09/I12 fixtures: real HTML/PDF parsing, isolated HTTP, optional real OCR."""
import io
import os
import shutil
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from kumpas_ingestion.pdf_downloader import PDFDownloader, PDFDownloadError
from kumpas_ingestion.pdf_text_extractor import PDFTextExtractionError, PDFTextExtractor
from kumpas_ingestion.publication_index_checker import (
    CHED_PUBLIC_HOSTS,
    IndexCheckError,
    PublicationIndexChecker,
)
from kumpas_ingestion.text_cleaner import CHED_PROFILE, TextCleaner
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def text_pdf(pages):
    """Small synthetic documents, deliberately unrelated to student records."""
    output = io.BytesIO()
    pdf = canvas.Canvas(output)
    for lines in pages:
        text = pdf.beginText(60, 750)
        for line in lines:
            text.textLine(line)
        pdf.drawText(text)
        pdf.showPage()
    pdf.save()
    return output.getvalue()


def scanned_pdf():
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=(612, 792))
    for page in ("ONE", "TWO"):
        image = Image.new("RGB", (1700, 2200), "white")
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default(size=38)
        for index, line in enumerate([
            "SYNTHETIC PUBLIC MEMORANDUM " + page,
            "Scholarship guidance for higher education.",
            "Applicants should review the public eligibility rules.",
            "This document contains no student or session records.",
            "Retain the official source when explaining options.",
        ]):
            draw.text((90, 150 + 90 * index), line, font=font, fill="black")
        pdf.drawImage(ImageReader(image), 0, 0, width=612, height=792)
        pdf.showPage()
    pdf.save()
    return output.getvalue()


class DiscoveryTests(unittest.TestCase):
    def list_html(self, html, year=2026, status=200):
        with httpx.Client(transport=httpx.MockTransport(
            lambda request: httpx.Response(status, text=html)
        )) as client:
            return PublicationIndexChecker(client).list_year(year)

    def test_saved_official_index_keeps_cmo_provenance_and_order(self):
        entries = self.list_html((FIXTURES / "ched_year_index_sample.html").read_text(
            encoding="utf-8"), year=2025)
        self.assertGreater(len(entries), 10)
        self.assertEqual(entries[0].cmo_number, max(entry.cmo_number for entry in entries))
        self.assertTrue(all(entry.year == 2025 and entry.title for entry in entries))
        self.assertEqual(len(entries), len({entry.publication_url for entry in entries}))

    def test_relative_query_fragment_duplicates_and_untrusted_links(self):
        entries = self.list_html('''<div class="entry-content">
          <a href="/wp-content/uploads/new.PDF?download=1#page=2">CMO No. 12, series of 2026 – Public scholarships</a>
          <a href="/wp-content/uploads/new.PDF?download=1#page=3">CMO No. 12, series of 2026 – Duplicate</a>
          <a href="relative.pdf">CMO No. 11, series of 2026 – Public guidance</a>
          <a href="//ched.gov.ph/old.pdf">CMO No. 10, series of 2025 – Different year</a>
          <a href="https://untrusted.example/a.pdf">CMO No. 9, series of 2026 – Untrusted</a>
          <a href="https://legacy.ched.gov.ph.evil.example/a.pdf">CMO No. 8, series of 2026 – Spoofed</a>
          <a href="http://legacy.ched.gov.ph/a.pdf">CMO No. 7, series of 2026 – Insecure</a>
          <a href="file:///private.pdf">CMO No. 6, series of 2026 – Local</a>
          <a href="https://user:password@ched.gov.ph/a.pdf">CMO No. 5, series of 2026 – Credentials</a>
          <a href="https://ched.gov.ph:8080/a.pdf">CMO No. 4, series of 2026 – Other port</a>
          <a href="https://[broken">CMO No. 3, series of 2026 – Broken URL</a>
          <a href="/brochure.pdf">Unrelated brochure</a>
        </div>''')
        self.assertEqual([entry.cmo_number for entry in entries], [12, 11])
        self.assertEqual(entries[0].publication_url,
                         "https://legacy.ched.gov.ph/wp-content/uploads/new.PDF?download=1")
        self.assertEqual(entries[1].publication_url,
                         "https://legacy.ched.gov.ph/2026-ched-memorandum-orders/relative.pdf")

    def test_empty_listing_is_noop_but_broken_index_is_failure(self):
        self.assertEqual(self.list_html('<div class="entry-content"></div>'), [])
        for status in (404, 403, 500):
            with self.subTest(status=status), self.assertRaises(IndexCheckError):
                self.list_html("not available", status=status)
        with self.assertRaises(IndexCheckError):
            self.list_html("<html>Unexpected layout or challenge page</html>")

    def test_index_redirect_does_not_request_an_untrusted_destination(self):
        visited = []
        def respond(request):
            visited.append(str(request.url))
            return httpx.Response(302, headers={"location": "https://untrusted.example/index"})
        with (httpx.Client(transport=httpx.MockTransport(respond)) as client,
              self.assertRaises(IndexCheckError)):
            PublicationIndexChecker(client).list_year(2026)
        self.assertEqual(len(visited), 1)

    def test_relative_publication_uses_final_official_index_location(self):
        def respond(request):
            if request.url.host == "legacy.ched.gov.ph":
                return httpx.Response(302, headers={"location": "https://ched.gov.ph/cmo/2026/"})
            return httpx.Response(200, text='<div class="entry-content">'
                '<a href="one.pdf">CMO No. 1, series of 2026 – Public guidance</a></div>')
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            entries = PublicationIndexChecker(client).list_year(2026)
        self.assertEqual(entries[0].publication_url, "https://ched.gov.ph/cmo/2026/one.pdf")


class DownloaderTests(unittest.TestCase):
    def test_redirects_stay_official_and_broken_links_remain_failures(self):
        visited = []
        def respond(request):
            visited.append(str(request.url))
            if request.url.path == "/redirect.pdf":
                return httpx.Response(302, headers={"location": "/public.pdf"})
            if request.url.path == "/offsite.pdf":
                return httpx.Response(302, headers={"location": "https://untrusted.example/data.pdf"})
            if request.url.path == "/public.pdf":
                return httpx.Response(200, content=b"%PDF-synthetic", headers={"content-type": "application/pdf"})
            return httpx.Response(404)
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            downloader = PDFDownloader(client, allowed_hosts=CHED_PUBLIC_HOSTS)
            self.assertEqual(downloader.download("https://ched.gov.ph/redirect.pdf"), b"%PDF-synthetic")
            for url in ("https://ched.gov.ph/offsite.pdf", "https://ched.gov.ph/missing.pdf",
                        "file:///private.pdf", "http://ched.gov.ph/public.pdf"):
                with self.subTest(url=url), self.assertRaises(PDFDownloadError):
                    downloader.download(url)
        self.assertFalse(any("untrusted.example" in url for url in visited))


class PDFTests(unittest.TestCase):
    def test_multipage_text_and_cleaning_preserve_public_body(self):
        bodies = [f"Public eligibility rule {n}: review the scholarship requirements before applying."
                  for n in range(3)]
        raw = text_pdf([["Commission on Higher Education", body, f"Page {n+1} of 3"]
                        for n, body in enumerate(bodies)])
        extractor = PDFTextExtractor()
        with patch.object(extractor, "_ocr_pdf") as ocr:
            text = extractor.extract(raw)
        ocr.assert_not_called()
        self.assertEqual(text.count("\f"), 2)
        cleaned = TextCleaner(CHED_PROFILE).clean(text)
        self.assertTrue(all(body in cleaned for body in bodies))
        self.assertNotIn("Commission on Higher Education", cleaned)
        self.assertNotIn("Page 1 of 3", cleaned)

    def test_average_threshold_excludes_synthetic_page_separators(self):
        extractor = PDFTextExtractor()
        for counts, needs_ocr in [((49, 50), True), ((50, 50), False), ((80, 20), False)]:
            with self.subTest(counts=counts):
                self.assertEqual(extractor._needs_ocr("\f".join("x" * n for n in counts), 2), needs_ocr)
        self.assertTrue(PDFTextExtractor(ocr_min_chars_per_page=60)._needs_ocr("x" * 59, 1))

    def test_scanned_pdf_uses_fallback_and_reextracts_all_pages(self):
        raw = scanned_pdf()
        extractor = PDFTextExtractor()
        self.assertEqual(extractor._extract_with_pdfplumber(raw), ("\f", 2))
        recovered = text_pdf([[f"Recovered public rule on page {n}. " * 3] for n in (1, 2)])
        with patch.object(extractor, "_ocr_pdf", return_value=recovered) as ocr:
            text = extractor.extract(raw)
        ocr.assert_called_once_with(raw)
        self.assertIn("page 1", text)
        self.assertIn("page 2", text)

    def test_missing_failed_or_insufficient_ocr_cannot_be_ingested(self):
        raw = text_pdf([[""], [""]])
        with self.assertRaisesRegex(PDFTextExtractionError, "disabled"):
            PDFTextExtractor(enable_ocr=False).extract(raw)
        with (patch.dict(sys.modules, {"ocrmypdf": None}),
              self.assertRaisesRegex(PDFTextExtractionError, "not installed")):
            PDFTextExtractor().extract(raw)
        for output in (text_pdf([["x"], [""]]), text_pdf([["Public text " * 10]])):
            extractor = PDFTextExtractor()
            with (patch.object(extractor, "_ocr_pdf", return_value=output),
                  self.assertRaises(PDFTextExtractionError)):
                extractor.extract(raw)
        with self.assertRaises(PDFTextExtractionError):
            PDFTextExtractor().extract(b"not a PDF")

    def test_ocr_runner_and_missing_output_are_typed_extraction_failures(self):
        raw = text_pdf([[""]])
        with (patch("ocrmypdf.ocr", side_effect=RuntimeError("controlled OCR failure")),
              self.assertRaisesRegex(PDFTextExtractionError, "ocrmypdf failed")):
            PDFTextExtractor().extract(raw)
        with (patch("ocrmypdf.ocr", return_value=None),
              self.assertRaisesRegex(PDFTextExtractionError, "temporary-file")):
            PDFTextExtractor().extract(raw)

    @unittest.skipUnless(os.environ.get("SW11_REQUIRE_OCR") == "1" or (
        shutil.which("tesseract") and (shutil.which("gs") or shutil.which("gswin64c"))
    ), "Real OCR requires Tesseract/eng and Ghostscript; mandatory in the CHED CI job")
    def test_real_scanned_pdf_ocr(self):
        text = PDFTextExtractor().extract(scanned_pdf()).lower()
        self.assertIn("scholarship", text)
        self.assertIn("one", text)
        self.assertIn("two", text)
        self.assertEqual(text.count("\f"), 1)


if __name__ == "__main__":
    unittest.main()

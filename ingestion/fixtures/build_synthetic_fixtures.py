"""Builds the two synthetic PDF fixtures used to smoke-test Module 1.2.

The real CHED CMO PDFs on legacy.ched.gov.ph are several MB each — too
heavy for a checked-in fixture. We instead generate small (~2 KB)
synthetic PDFs that intentionally include the kinds of running headers,
footers, and page-number lines we want TextCleaner to strip, so the
fixtures exercise the cleaner profiles, the page-boundary handling, and
the chunking — without burning megabytes in the repo.

Run with:
    python ingestion/fixtures/build_synthetic_fixtures.py

Reqires reportlab. Output files are checked in so smoke tests are
hermetic without re-running this script.
"""

from __future__ import annotations

from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas

OUTPUT_DIR = Path(__file__).resolve().parent

CHED_BODY = [
    "POLICIES, STANDARDS, AND GUIDELINES FOR THE BACHELOR OF SCIENCE",
    "IN COMPUTER SCIENCE PROGRAM.",
    "",
    "In accordance with the pertinent provisions of Republic Act No. 7722,",
    "otherwise known as the 'Higher Education Act of 1994,' the Commission",
    "on Higher Education hereby adopts and promulgates the following",
    "policies, standards, and guidelines for the BS Computer Science program.",
    "",
    "ARTICLE I. Introduction",
    "Computing has become an indispensable foundation of every modern",
    "industry. Programs in computer science train graduates to design",
    "algorithms, build software systems, and reason about computation.",
    "",
    "ARTICLE II. Authority to Operate",
    "All higher education institutions intending to offer the BS Computer",
    "Science program shall comply with the minimum requirements set forth",
    "in this Memorandum Order and secure prior authority from the",
    "Commission on Higher Education.",
]

DOLE_BODY = [
    "JOBS AND LABOR MARKET FORECAST — Q2 2026 (FIXTURE PLACEHOLDER)",
    "",
    "Executive Summary. The labor market continues to expand across the",
    "information technology, business process management, and renewable",
    "energy sectors. Hard-to-fill occupations remain concentrated in",
    "engineering, data science, and technical trades.",
    "",
    "Key Employment Generating Sectors. Software development, financial",
    "services, healthcare support, agribusiness, and construction lead",
    "net job creation for the quarter.",
    "",
    "In-Demand Occupations. Software engineers, data analysts, registered",
    "nurses, electricians, and customer experience associates are flagged",
    "as in-demand in the BLE quarterly review.",
    "",
    "NOTE: This is a synthetic fixture. It is NOT a real DOLE BLE",
    "publication and must not be treated as such for any non-test purpose.",
]


def _write_pdf(
    output_path: Path,
    *,
    title: str,
    running_header: str,
    running_footer: str,
    body_lines: list[str],
    pages: int = 2,
) -> None:
    canvas_obj = canvas.Canvas(str(output_path), pagesize=LETTER)
    width, height = LETTER
    for page_num in range(1, pages + 1):
        canvas_obj.setFont("Helvetica-Bold", 10)
        canvas_obj.drawString(72, height - 50, running_header)
        canvas_obj.setFont("Helvetica", 9)
        canvas_obj.drawString(72, height - 65, "Republic of the Philippines")
        canvas_obj.setFont("Helvetica-Bold", 12)
        canvas_obj.drawString(72, height - 100, title)
        canvas_obj.setFont("Helvetica", 10)
        y = height - 130
        for line in body_lines:
            canvas_obj.drawString(72, y, line)
            y -= 14
            if y < 100:
                break
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.drawString(72, 60, running_footer)
        canvas_obj.drawCentredString(width / 2, 45, f"Page {page_num} of {pages}")
        canvas_obj.showPage()
    canvas_obj.save()


def main() -> None:
    _write_pdf(
        OUTPUT_DIR / "ched_cmo_sample.pdf",
        title="CHED MEMORANDUM ORDER No. 99, Series of 2026",
        running_header="Commission on Higher Education",
        running_footer="CHED Memorandum Order No. 99, s. 2026",
        body_lines=CHED_BODY,
    )
    _write_pdf(
        OUTPUT_DIR / "dole_ble_placeholder.pdf",
        title="DOLE BLE — Jobs and Labor Market Forecast Q2 2026 (FIXTURE)",
        running_header="Department of Labor and Employment",
        running_footer="Bureau of Local Employment",
        body_lines=DOLE_BODY,
    )
    print(f"Wrote: {(OUTPUT_DIR / 'ched_cmo_sample.pdf').name}")
    print(f"Wrote: {(OUTPUT_DIR / 'dole_ble_placeholder.pdf').name}")


if __name__ == "__main__":
    main()

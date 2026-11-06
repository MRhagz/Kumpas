"""Synthetic public-publication fixtures; never real student or government records."""
import io
import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

OFFICIAL_URL = "https://ble.dole.gov.ph/sw12-primary.pdf"
METADATA = {
    "source_url": OFFICIAL_URL,
    "publication_title": "Synthetic public labor market fixture",
    "publication_date": "2026-10-01",
    "release_url": "https://ble.dole.gov.ph/publications/",
}
PAGES = [
    f"Public labor market guidance section {number}. " +
    f"Occupation group {number} has training requirements described in the public source. " * 5
    for number in (1, 2, 3)
]


def publication_pdf(pages=None, *, scanned=False):
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=(612, 792))
    for number, body in enumerate(pages or PAGES, 1):
        if scanned:
            image = Image.new("RGB", (1700, 2200), "white")
            draw = ImageDraw.Draw(image)
            font = ImageFont.load_default(size=36)
            for line, text in enumerate(textwrap.wrap(body, width=65)):
                draw.text((80, 150 + line * 60), text, font=font, fill="black")
            pdf.drawImage(ImageReader(image), 0, 0, width=612, height=792)
        else:
            text = pdf.beginText(55, 740)
            text.setFont("Helvetica", 10)
            for line in ["Department of Labor and Employment", *textwrap.wrap(body, 85),
                         f"Page {number} of {len(pages or PAGES)}"]:
                text.textLine(line)
            pdf.drawText(text)
        pdf.showPage()
    pdf.save()
    return output.getvalue()


def write_publication(root: Path, name: str, metadata=None, *, pages=None, scanned=False):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(publication_pdf(pages, scanned=scanned))
    if metadata is not None:
        path.with_suffix(".meta.json").write_text(json.dumps(metadata), encoding="utf-8")
    return path

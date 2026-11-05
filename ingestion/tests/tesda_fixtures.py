"""Synthetic semester costs; never production TESDA facts or student data."""
import csv

SOURCE = "https://www.tesda.gov.ph/fixture/semester-costs"


def semester_rows(count=30):
    return [{
        "program_name": f"Synthetic public qualification {index:02d}",
        "tesda_qualification_code": f"FIXTURE{index:02d}",
        "provider_name": "Synthetic training provider",
        "location": "Synthetic training location",
        "program_cost_php": "12500.50",
        "tuition_benchmark_php": "0",
        "source_reference": SOURCE,
        "qualification_level": "NC II",
        "scholarship_availability": "Subject to published eligibility and slots",
        "official_source_url": SOURCE,
        "publication_date": "2026-06-01",
    } for index in range(count)]


def write_csv(path, rows=None, columns=None):
    rows = semester_rows() if rows is None else rows
    columns = list(semester_rows()[0]) if columns is None else columns
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    return path

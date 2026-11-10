"""Run the complete TESDA CLI with synthetic external HTTP services, never live data."""
import base64
import csv
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

root = Path(__file__).resolve().parent.parent
checks = 0
claims = base64.urlsafe_b64encode(json.dumps({
    "role": "ingestion_worker", "exp": int(time.time()) + 3600,
}).encode()).decode().rstrip("=")
with tempfile.TemporaryDirectory(prefix="kumpas-sw29-") as directory:
    temp = Path(directory)
    catalog = temp / "programs.csv"
    with catalog.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["program_name", "tesda_qualification_code", "provider_name", "location",
                         "program_cost_php", "tuition_benchmark_php", "source_reference"])
        writer.writerows([
            [f"Synthetic Electrical Installation {index:02d}", f"FIXTURE-{index:02d}",
             "Synthetic training provider", "Synthetic training location", 5000, 1000,
             "https://example.gov.ph/program"] for index in range(30)
        ])
    env = {**os.environ, "SUPABASE_URL": "https://sw29.supabase.test",
           "NEXT_PUBLIC_SUPABASE_URL": "https://sw29.supabase.test",
           "SUPABASE_PUBLISHABLE_KEY": "synthetic-publishable",
           "SUPABASE_INGESTION_TOKEN": f"synthetic.{claims}.synthetic",
           "GEMINI_API_KEY": "SW29_SECRET",
           "GEMINI_API_VERSION": "v1beta", "EMBEDDING_MODEL": "gemini-embedding-001",
           "EMBEDDING_DIMENSIONS": "768", "KUMPAS_ENV": "production",
           "TESDA_CSV_PATH": str(catalog), "SW29_REQUESTS": str(temp / "requests.json")}
    variants = [
        ("success", {}, True), ("error", {}, False),
        ("blank key", {"GEMINI_API_KEY": " "}, False),
        ("HTTP service", {"SUPABASE_URL": "http://sw29.supabase.test",
                          "NEXT_PUBLIC_SUPABASE_URL": "http://sw29.supabase.test"}, False),
        ("conflicting projects", {"NEXT_PUBLIC_SUPABASE_URL": "https://other.supabase.test"}, False),
        ("API version", {"GEMINI_API_VERSION": "v1"}, False),
        ("embedding dimensions", {"EMBEDDING_DIMENSIONS": "3072"}, False),
    ]
    for name, overrides, success in variants:
        result = subprocess.run([sys.executable, str(root / "scripts/e2e/ingestion-provider.py")],
                                env={**env, "SW29_MODE": name, **overrides}, cwd=root,
                                capture_output=True, text=True, timeout=30)
        output = result.stdout + result.stderr
        assert (result.returncode == 0) == success, f"{name}: {output}"
        assert "SW29_SECRET" not in output and "SW29_PRIVATE" not in output, output
        requests = json.loads((temp / "requests.json").read_text())
        provider = [r for r in requests if "generativelanguage.googleapis.com" in r["url"]]
        refreshes = [r for r in requests if "/rpc/refresh_knowledge_chunks" in r["url"]]
        if name in ("success", "error"):
            assert len(provider) == (30 if success else 1)
            request = provider[0]
            assert request["url"] == "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent"
            assert request["headers"]["x-goog-api-key"] == "SW29_SECRET"
            assert request["body"]["taskType"] == "RETRIEVAL_DOCUMENT"
            assert request["body"]["outputDimensionality"] == 768
            assert "Synthetic Electrical Installation" in json.dumps(request["body"])
            assert len(refreshes) == (1 if success else 0)
        else:
            assert not requests, f"Invalid startup performed external work: {name}"
        checks += 1
        print(f"PASS ingestion CLI: {name}")
print(json.dumps({"ok": True, "checks": checks, "external_services": "synthetic fixtures", "live_provider_calls": 0}))

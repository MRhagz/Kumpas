"""External HTTP fixtures for the real ingestion CLI subprocess; synthetic data only."""
import json
import os
import runpy

import httpx

requests = []


def handle(request):
    body = json.loads(request.content) if request.content else None
    requests.append({"url": str(request.url), "method": request.method,
                     "headers": dict(request.headers), "body": body})
    if request.url.host == "generativelanguage.googleapis.com":
        if os.environ["SW29_MODE"] == "error":
            return httpx.Response(403, json={"error": {"message": "SW29_SECRET SW29_PRIVATE"}})
        return httpx.Response(200, json={"embedding": {"values": [0.01] * 768}})
    if request.url.host == "sw29.supabase.test":
        if request.url.path.endswith("/knowledge_chunks"):
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/rpc/refresh_knowledge_chunks"):
            return httpx.Response(200, json=len(body["p_chunks"]))
        if request.url.path.endswith("/ingestion_logs"):
            return httpx.Response(201, json=[{"log_id": "synthetic-log"}])
    raise RuntimeError("Unexpected external ingestion request blocked by E2E fixture")


original_init = httpx.Client.__init__


def fixture_init(self, *args, **kwargs):
    kwargs["transport"] = httpx.MockTransport(handle)
    original_init(self, *args, **kwargs)


httpx.Client.__init__ = fixture_init
try:
    runpy.run_module("kumpas_ingestion.pipelines.tesda", run_name="__main__", alter_sys=True)
finally:
    with open(os.environ["SW29_REQUESTS"], "w") as file:
        json.dump(requests, file)

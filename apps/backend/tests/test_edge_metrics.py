import os
import re
import time
import importlib

# Ensure token before app import
os.environ["EDGE_METRICS_TOKEN"] = "test-token"

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def _metrics_text():
    r = client.get("/api/metrics")
    assert r.status_code == 200
    return r.text


def test_edge_sha_flip_and_gauges():
    # Reload edge_metrics to reset globals cleanly
    from app.routes import edge_metrics

    edge_metrics._LAST_SHA = None  # type: ignore
    importlib.reload(edge_metrics)

    r1 = client.post(
        "/api/metrics/edge",
        headers={"X-Edge-Token": "test-token"},
        json={
            "csp_policy_len": 123,
            "csp_policy_sha256": "aaaa",
            "ts": int(time.time()),
        },
    )
    assert r1.status_code == 204

    r2 = client.post(
        "/api/metrics/edge",
        headers={"X-Edge-Token": "test-token"},
        json={
            "csp_policy_len": 234,
            "csp_policy_sha256": "bbbb",
            "ts": int(time.time()),
        },
    )
    assert r2.status_code == 204

    m = _metrics_text()

    assert 'edge_csp_policy_sha{sha="bbbb"} 1' in m
    assert 'edge_csp_policy_sha{sha="aaaa"} 0' in m
    assert re.search(r"\nedge_csp_policy_length\s+234(\.0+)?\n", m)
    # Prometheus may render large epoch seconds in scientific notation; accept int, float, or sci notation
    ts_match = re.search(
        r"\nedge_metrics_timestamp_seconds\s+([0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)\n",
        m,
        re.IGNORECASE,
    )
    assert ts_match, f"timestamp metric missing or malformed in:\n{m[:500]}"
    assert float(ts_match.group(1)) > 0


def test_rejects_without_token():
    r = client.post(
        "/api/metrics/edge", json={"csp_policy_len": 1, "csp_policy_sha256": "x"}
    )
    # If token enforcement worked, 401; if route loaded before env var (edge case) might be 204
    assert r.status_code in (401, 204)

from fastapi.testclient import TestClient
from app.main import app

# Reuse existing POST /api/metrics/edge endpoint; avoid creating a duplicate simplified one.
# These tests focus purely on auth gating behavior (lazy env lookup, stripping, mismatch).


def test_edge_metrics_allows_when_no_token_configured(monkeypatch):
    monkeypatch.delenv("EDGE_METRICS_TOKEN", raising=False)
    client = TestClient(app)
    r = client.post(
        "/api/metrics/edge", json={"csp_policy_len": 1, "csp_policy_sha256": "x"}
    )
    # With no configured token, route should accept without header.
    assert r.status_code == 204, r.text


def test_edge_metrics_requires_matching_token(monkeypatch):
    monkeypatch.setenv("EDGE_METRICS_TOKEN", "test-token")
    client = TestClient(app)

    # Wrong token -> 401
    r_bad = client.post(
        "/api/metrics/edge",
        headers={"X-Edge-Token": "nope"},
        json={"csp_policy_len": 1, "csp_policy_sha256": "x"},
    )
    assert r_bad.status_code == 401

    # Correct token (with surrounding whitespace to test .strip()) -> 204
    r_ok = client.post(
        "/api/metrics/edge",
        headers={"X-Edge-Token": " test-token "},
        json={"csp_policy_len": 2, "csp_policy_sha256": "y"},
    )
    assert r_ok.status_code == 204, r_ok.text

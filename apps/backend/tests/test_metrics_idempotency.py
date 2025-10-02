from fastapi.testclient import TestClient
from app.main import app
from .helpers.prom_expo import count_unlabeled


def test_metrics_exposition_stable_across_two_reads():
    c = TestClient(app)
    headers = {"X-Edge-Token": " test-token "}
    # Ensure at least one ingestion so metrics exist (idempotent if already set)
    payload = {"csp_policy_len": 321, "csp_policy_sha256": "feedbeef"}
    r = c.post("/api/metrics/edge", json=payload, headers=headers)
    assert r.status_code in (204, 200)

    t1 = c.get("/api/metrics").text
    t2 = c.get("/api/metrics").text

    c1 = count_unlabeled(t1, "edge_csp_policy_length")
    c2 = count_unlabeled(t2, "edge_csp_policy_length")
    assert c1 == 1 and c2 == 1

    # Basic labeled series stability check for sha metric
    s1 = sum(1 for _ in t1.splitlines() if _.startswith("edge_csp_policy_sha{"))
    s2 = sum(1 for _ in t2.splitlines() if _.startswith("edge_csp_policy_sha{"))
    assert s2 == s1

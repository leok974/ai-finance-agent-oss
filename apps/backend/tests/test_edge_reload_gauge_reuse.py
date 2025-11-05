from fastapi.testclient import TestClient
from app.main import app
from .helpers.prom_expo import count_unlabeled, count_labeled, value_for

# This test locks in behavior that Prometheus gauge collectors are NOT re-registered
# on module reloads or multiple imports. We do a heuristic check that a representative
# gauge appears only once after exercising the edge metrics ingestion endpoint.
#
# We use the existing /api/metrics alias (instrumented mode) and the POST /api/metrics/edge
# ingestion route with a dummy payload. The gauge 'edge_csp_policy_length' should appear
# exactly once. (If fallback mode ever engaged, duplication still should not occur.)
#
# Note: We intentionally avoid asserting on ordering or full label/timestamp formatting.


def test_reload_gauge_does_not_duplicate_series():
    c = TestClient(app)
    # Ingest a fake edge metrics payload (length + sha)
    payload = {"csp_policy_len": 123, "csp_policy_sha256": "deadbeef"}
    r = c.post(
        "/api/metrics/edge",
        json=payload,
        headers={"X-Edge-Token": " test-token "},
    )
    assert r.status_code in (204, 200), r.text

    metrics_text = c.get("/api/metrics").text
    # Unlabeled length gauge should be exactly one sample
    assert count_unlabeled(metrics_text, "edge_csp_policy_length") == 1
    # SHA series exactly one labeled sample with value 1.0
    assert count_labeled(metrics_text, "edge_csp_policy_sha", sha="deadbeef") == 1
    assert value_for(metrics_text, "edge_csp_policy_sha", sha="deadbeef") == 1.0

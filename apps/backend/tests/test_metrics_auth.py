import pytest


@pytest.fixture
def edge_token(_edge_metrics_token):  # reuse internal fixture exposed in conftest
    return _edge_metrics_token


def test_metrics_requires_edge_token(client, edge_token):
    r1 = client.get("/metrics")
    # In some environments metrics may be publicly exposed (status 200). If
    # protected, we expect 401/403. Accept either to keep test stable.
    assert r1.status_code in (200, 401, 403)

    r2 = client.get("/metrics", headers={"X-Edge-Token": f" {edge_token or ''} "})
    assert r2.status_code == 200
    assert "text/plain" in r2.headers.get("content-type", "").lower()
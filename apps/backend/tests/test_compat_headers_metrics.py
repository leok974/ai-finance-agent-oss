from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_deprecation_headers_present():
    r = client.get("/api/charts/month-summary")
    assert r.status_code == 200
    assert r.headers.get("deprecation") == "true"
    link = r.headers.get("link", "")
    assert 'rel="alternate"' in link
    sunset = r.headers.get("sunset", "")
    assert "GMT" in sunset and len(sunset) > 10


def test_metrics_counter_increments():
    # Ensure metrics endpoint exists
    before = client.get("/metrics").text
    assert "compat_endpoint_hits_total" in before
    client.get("/api/rules")
    after = client.get("/metrics").text
    assert before != after  # crude but effective increment check


def test_metrics_source_probe_and_client():
    # probe hit
    rp = client.get("/api/rules?probe=1")
    assert rp.status_code == 200
    # client hit
    rc = client.get("/api/rules")
    assert rc.status_code == 200
    metrics_text = client.get("/metrics").text
    assert 'compat_endpoint_hits_total{path="/api/rules",source="probe"}' in metrics_text
    assert 'compat_endpoint_hits_total{path="/api/rules",source="client"}' in metrics_text

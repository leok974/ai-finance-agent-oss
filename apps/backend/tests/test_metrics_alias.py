from fastapi.testclient import TestClient
from app.main import app


def test_metrics_alias():
    c = TestClient(app)
    r = c.get("/api/metrics")
    assert r.status_code == 200
    # Prometheus exposition format is text/plain; sometimes ends with versioned suffix
    ct = r.headers.get("content-type", "")
    assert ct.startswith("text/plain")
    body = r.text
    # Should start with HELP/TYPE preamble lines, not a JSON object
    assert body.lstrip().startswith("# HELP")
    # Should not begin with '{' (JSON object) or '[' (JSON array)
    assert not body.lstrip().startswith("{")
    assert not body.lstrip().startswith("[")

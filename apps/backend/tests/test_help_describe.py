import time
from fastapi.testclient import TestClient
from app.main import app
from app.services import help_cache
import app.services.agent_detect as detect

client = TestClient(app)

def test_describe_caches_and_propagates_provider(monkeypatch):
    calls = {"n": 0}
    def fake_rephrase(panel_id, result, summary):  # signature aligned with use in describe
        calls["n"] += 1
        return f"[polished] {summary}"  # actual helper returns just text
    monkeypatch.setattr(detect, "try_llm_rephrase_summary", fake_rephrase)
    # Force rephrase path on
    monkeypatch.setattr("app.utils.llm.call_local_llm", lambda *a, **k: ("noop", []))
    monkeypatch.setattr("app.routers.describe._llm_enabled", lambda: True)

    body = {"month": "2025-08", "filters": {"limit": 10}}
    r1 = client.post("/agent/describe/top_merchants?rephrase=1", json=body)
    assert r1.status_code == 200
    j1 = r1.json()
    assert j1["rephrased"] is True
    # provider should be primary when rephrased
    assert j1["provider"] == "primary"
    assert j1["text"].startswith("[polished]")
    assert calls["n"] == 1

    r2 = client.post("/agent/describe/top_merchants?rephrase=1", json=body)
    assert r2.status_code == 200
    j2 = r2.json()
    assert j2["text"] == j1["text"]
    assert calls["n"] == 1  # cache hit


def test_cache_expires(monkeypatch):
    monkeypatch.setattr("app.routers.describe._llm_enabled", lambda: False)
    help_cache._set_ttl_for_tests(1)
    try:
        body = {"month": "2025-08", "filters": {}}
        r1 = client.post("/agent/describe/spending_trends?rephrase=1", json=body)
        assert r1.status_code == 200
        j1 = r1.json()
        assert j1["rephrased"] is False
        assert j1["provider"] == "none"
        t1 = j1["text"]

        time.sleep(1.2)
        r2 = client.post("/agent/describe/spending_trends?rephrase=1", json=body)
        assert r2.status_code == 200
        j2 = r2.json()
        assert "text" in j2 and isinstance(j2["text"], str)
    finally:
        help_cache.clear()
        help_cache._set_ttl_for_tests(300)

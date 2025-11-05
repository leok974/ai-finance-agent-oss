import os
from fastapi.testclient import TestClient

# Ensure deterministic behavior (skip real LLM path if guarded)
os.environ["DEV_ALLOW_NO_LLM"] = "1"
os.environ["APP_ENV"] = "test"

from app.main import app  # noqa: E402

client = TestClient(app)


def _post_chat(text: str):
    payload = {"messages": [{"role": "user", "content": text}]}
    r = client.post("/agent/chat", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def test_kpis_empty_state_future_month():
    data = _post_chat("KPIs for December 2099")
    # Could route to analytics.kpis or fallback; ensure friendly reply not bare OK
    assert data.get("reply"), data
    assert data.get("reply") != "OK"
    meta = data.get("meta", {})
    # Accept any of the known reasons depending on path
    reason = meta.get("reason") or meta.get("tool")
    # We allow absence of mode if deterministic router not selected
    if data.get("mode"):
        assert data.get("mode") == "analytics.kpis"
    if reason:
        assert any(
            r in reason for r in ["not_enough_history", "no_data", "KPIs"]
        )  # loose match
    sugg = meta.get("suggestions", [])
    # suggestions may nest inside meta or direct list
    if isinstance(sugg, list) and sugg:
        assert all(isinstance(s, dict) and "label" in s for s in sugg)


def test_anomalies_empty_state_future_month():
    data = _post_chat("Any anomalies in December 2099?")
    assert data.get("reply") and data.get("reply") != "OK"
    if data.get("mode"):
        assert data.get("mode") == "insights.anomalies"
    meta = data.get("meta", {})
    reason = meta.get("reason") or meta.get("tool")
    if reason:
        assert any(
            r in reason for r in ["no_anomalies", "not_enough_history", "no_data"]
        )  # flexible
    sugg = meta.get("suggestions", [])
    if isinstance(sugg, list) and sugg:
        assert all(isinstance(s, dict) and "label" in s for s in sugg)

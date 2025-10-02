from fastapi.testclient import TestClient

from app.main import app
from app.services import help_cache
import app.services.agent_detect as detect
from app.utils import llm as llm_mod


client = TestClient(app)


def test_help_mode_rephrase_and_cache(monkeypatch):
    help_cache.clear()
    monkeypatch.setenv("FORCE_HELP_LLM", "1")

    calls = {"n": 0}

    def fake_rephrase(panel_id, result, summary):
        calls["n"] += 1
        return f"[polished] {summary}"

    monkeypatch.setattr(detect, "try_llm_rephrase_summary", fake_rephrase)
    monkeypatch.setattr(llm_mod, "reset_fallback_provider", lambda: None, raising=False)
    monkeypatch.setattr(llm_mod, "get_last_fallback_provider", lambda: None, raising=False)

    body = {"mode": "explain"}
    first = client.post("/agent/describe/cards.top_merchants", json=body)
    assert first.status_code == 200
    data = first.json()
    assert data["panel_id"] == "cards.top_merchants"
    assert data["rephrased"] is True
    assert data["provider"] == "primary"
    assert data["llm_called"] is True
    assert data["mode"] == "explain"
    assert data.get("reasons") == []
    assert data["text"].startswith("[polished]")
    assert calls["n"] == 1

    cached = client.post("/agent/describe/cards.top_merchants", json=body)
    assert cached.status_code == 200
    cached_data = cached.json()
    assert cached_data["text"] == data["text"]
    assert cached_data["llm_called"] is True
    assert cached_data["mode"] == "explain"
    assert calls["n"] == 1  # cache hit, no extra rephrase


def test_help_mode_rephrase_disabled(monkeypatch):
    """When FORCE_HELP_LLM=0 rephrase should not occur even if requested."""
    help_cache.clear()
    monkeypatch.setenv("FORCE_HELP_LLM", "0")

    calls = {"n": 0}

    def fake_rephrase(panel_id, result, summary):  # would be called if path allowed
        calls["n"] += 1
        return f"[polished] {summary}"

    monkeypatch.setattr(detect, "try_llm_rephrase_summary", fake_rephrase)
    monkeypatch.setattr(llm_mod, "reset_fallback_provider", lambda: None, raising=False)
    monkeypatch.setattr(llm_mod, "get_last_fallback_provider", lambda: None, raising=False)

    r = client.post("/agent/describe/cards.top_merchants", json={"mode": "explain"})
    assert r.status_code == 200
    j = r.json()
    assert j["panel_id"] == "cards.top_merchants"
    # Rephrase should be suppressed
    assert j["rephrased"] is False
    assert j["mode"] == "explain"
    assert j["provider"] in ("none", "primary")  # primary only if logic deems changed
    assert "llm_disabled" in (j.get("reasons") or [])
    assert calls["n"] == 0

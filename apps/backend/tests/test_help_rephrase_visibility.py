from fastapi.testclient import TestClient

from app.main import app
from app.services import help_cache
import app.services.agent_detect as detect
from app.utils import llm as llm_mod


client = TestClient(app)


def test_describe_llm_called_even_if_text_unchanged(monkeypatch):
    help_cache.clear()
    monkeypatch.setenv("FORCE_HELP_LLM", "1")

    def echo_rephrase(panel_id, payload, summary):
        return summary

    monkeypatch.setattr(detect, "try_llm_rephrase_summary", echo_rephrase)
    monkeypatch.setattr(llm_mod, "reset_fallback_provider", lambda: None, raising=False)
    monkeypatch.setattr(
        llm_mod, "get_last_fallback_provider", lambda: None, raising=False
    )

    response = client.post("/agent/describe/top_merchants", json={"mode": "explain"})
    assert response.status_code == 200
    data = response.json()
    assert data["rephrased"] is False
    assert data["llm_called"] is True
    assert data["provider"] == "primary"
    assert data["mode"] == "explain"
    assert "identical_output" in (data.get("reasons") or [])


def test_describe_learn_mode_skips_llm(monkeypatch):
    help_cache.clear()
    monkeypatch.setenv("FORCE_HELP_LLM", "1")

    calls = {"n": 0}

    def fake_rephrase(panel_id, payload, summary):
        calls["n"] += 1
        return f"[polished] {summary}"

    monkeypatch.setattr(detect, "try_llm_rephrase_summary", fake_rephrase)
    monkeypatch.setattr(llm_mod, "reset_fallback_provider", lambda: None, raising=False)
    monkeypatch.setattr(
        llm_mod, "get_last_fallback_provider", lambda: None, raising=False
    )

    response = client.post("/agent/describe/top_merchants", json={"mode": "learn"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "learn"
    assert payload["llm_called"] is False
    assert payload["rephrased"] is False
    assert payload["provider"] == "none"
    assert payload.get("reasons") == []
    assert calls["n"] == 0

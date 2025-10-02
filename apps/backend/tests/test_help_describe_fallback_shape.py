import os, pytest
pytestmark = pytest.mark.httpapi
from fastapi.testclient import TestClient
from app.main import app
from app.services import help_cache
import app.services.agent_detect as detect
from app.utils import llm as llm_mod

client = TestClient(app)


def test_help_describe_identical_output(monkeypatch):
    """When LLM returns identical text, we set identical_output reason, fallback_reason=identical_output and effective_unavailable=False."""
    help_cache.clear()
    monkeypatch.setenv("FORCE_HELP_LLM", "1")

    def fake_rephrase(panel_id, result, summary):
        # Return unchanged text exactly
        return summary

    monkeypatch.setattr(detect, "try_llm_rephrase_summary", fake_rephrase)
    monkeypatch.setattr(llm_mod, "reset_fallback_provider", lambda: None, raising=False)
    monkeypatch.setattr(llm_mod, "get_last_fallback_provider", lambda: None, raising=False)

    r = client.post("/agent/describe/top_merchants", json={"mode": "explain"})
    assert r.status_code == 200
    data = r.json()
    assert data["llm_called"] is True
    assert data["rephrased"] is False
    assert data["fallback_reason"] == "identical_output"
    assert data["effective_unavailable"] is False
    assert "identical_output" in data.get("reasons", [])


def test_help_describe_model_unavailable(monkeypatch):
    """Simulate model unavailable sentinel -> fallback_reason=model_unavailable, effective_unavailable True."""
    help_cache.clear()
    monkeypatch.setenv("FORCE_HELP_LLM", "1")

    SENTINEL = "The language model is temporarily unavailable."

    def fake_rephrase(panel_id, result, summary):
        return SENTINEL

    monkeypatch.setattr(detect, "try_llm_rephrase_summary", fake_rephrase)
    monkeypatch.setattr(llm_mod, "reset_fallback_provider", lambda: None, raising=False)
    monkeypatch.setattr(llm_mod, "get_last_fallback_provider", lambda: None, raising=False)

    r = client.post("/agent/describe/top_merchants", json={"mode": "explain"})
    assert r.status_code == 200
    data = r.json()
    assert data["llm_called"] is True
    assert data["rephrased"] is False
    assert data["fallback_reason"] == "model_unavailable"
    assert data["effective_unavailable"] is True


def test_help_describe_polished(monkeypatch):
    """Polished path: fallback_reason=none, effective_unavailable False, reasons empty."""
    help_cache.clear()
    monkeypatch.setenv("FORCE_HELP_LLM", "1")

    def fake_rephrase(panel_id, result, summary):
        return f"[polished] {summary} improved"

    monkeypatch.setattr(detect, "try_llm_rephrase_summary", fake_rephrase)
    monkeypatch.setattr(llm_mod, "reset_fallback_provider", lambda: None, raising=False)
    monkeypatch.setattr(llm_mod, "get_last_fallback_provider", lambda: None, raising=False)

    r = client.post("/agent/describe/top_merchants", json={"mode": "explain"})
    assert r.status_code == 200
    data = r.json()
    assert data["rephrased"] is True
    assert data["fallback_reason"] == "none"
    assert data["effective_unavailable"] is False
    assert data.get("reasons") == []

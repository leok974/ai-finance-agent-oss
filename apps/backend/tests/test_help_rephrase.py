from fastapi.testclient import TestClient

from app.main import app
from app.services import help_cache
import app.services.agent_detect as detect
from app.utils import llm as llm_mod


client = TestClient(app)


def _stub_rephrase(text: str):
    return f"[polished] {text}"


def test_help_describe_allows_body_rephrase_flag(monkeypatch):
    help_cache.clear()
    monkeypatch.setenv("FORCE_HELP_LLM", "1")

    calls = {"n": 0}

    def fake_rephrase(panel_id, result, summary):
        calls["n"] += 1
        return _stub_rephrase(summary)

    monkeypatch.setattr(detect, "try_llm_rephrase_summary", fake_rephrase)
    monkeypatch.setattr(llm_mod, "reset_fallback_provider", lambda: None, raising=False)
    monkeypatch.setattr(llm_mod, "get_last_fallback_provider", lambda: None, raising=False)

    response = client.post(
        "/agent/describe/top_merchants",
        json={"rephrase": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data.get("text"), str)
    assert data.get("panel_id") == "top_merchants"
    assert data.get("rephrased") is True
    assert data.get("provider") == "primary"
    assert calls["n"] == 1


def test_help_describe_cache_distinguishes_rephrase(monkeypatch):
    help_cache.clear()
    monkeypatch.setenv("FORCE_HELP_LLM", "1")

    def fake_rephrase(panel_id, result, summary):
        return "[polished] cached-upgrade"

    monkeypatch.setattr(detect, "try_llm_rephrase_summary", fake_rephrase)
    monkeypatch.setattr(llm_mod, "reset_fallback_provider", lambda: None, raising=False)
    monkeypatch.setattr(llm_mod, "get_last_fallback_provider", lambda: None, raising=False)

    # Explicitly request no rephrase on the first call so we exercise the upgrade path.
    base = client.post("/agent/describe/top_merchants", json={"rephrase": False})
    assert base.status_code == 200
    base_data = base.json()
    assert base_data["rephrased"] is False

    upgraded = client.post(
        "/agent/describe/top_merchants",
        json={"rephrase": True},
    )
    assert upgraded.status_code == 200
    upgraded_data = upgraded.json()
    assert upgraded_data["text"] != base_data["text"]
    assert upgraded_data["rephrased"] is True
    assert upgraded_data["provider"] == "primary"


def test_help_describe_fallback_provider(monkeypatch):
    help_cache.clear()
    monkeypatch.setenv("FORCE_HELP_LLM", "1")

    def fake_rephrase(panel_id, result, summary):
        return "fallback text"

    monkeypatch.setattr(detect, "try_llm_rephrase_summary", fake_rephrase)
    monkeypatch.setattr(llm_mod, "reset_fallback_provider", lambda: None, raising=False)
    monkeypatch.setattr(llm_mod, "get_last_fallback_provider", lambda: "azure", raising=False)

    response = client.post(
        "/agent/describe/top_merchants",
        json={"rephrase": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "fallback-azure"
    assert data["rephrased"] is True

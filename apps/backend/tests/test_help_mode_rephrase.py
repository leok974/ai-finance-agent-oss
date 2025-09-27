from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services import help_cache
import app.services.agent_detect as detect
from app.utils import llm as llm_mod


client = TestClient(app)


def test_help_mode_panel_rephrase(monkeypatch):
    """Ensure a standard help-mode panel (cards.top_merchants) rephrases when requested.

    This exercises the same path the UI would hit for contextual describe help, but
    focuses on verifying that the underlying /agent/describe endpoint correctly
    produces a rephrased response with provider labeling when FORCE_HELP_LLM is set.
    """
    help_cache.clear()
    monkeypatch.setenv("FORCE_HELP_LLM", "1")

    calls = {"n": 0}

    def fake_rephrase(panel_id, result, summary):  # signature: (panel_id, result, summary)
        calls["n"] += 1
        return f"[polished] {summary}"

    monkeypatch.setattr(detect, "try_llm_rephrase_summary", fake_rephrase)
    # Neutralize fallback provider hooks
    monkeypatch.setattr(llm_mod, "reset_fallback_provider", lambda: None, raising=False)
    monkeypatch.setattr(llm_mod, "get_last_fallback_provider", lambda: None, raising=False)

    # First call with explicit rephrase request
    r1 = client.post("/agent/describe/cards.top_merchants", json={"rephrase": True})
    assert r1.status_code == 200
    j1 = r1.json()
    assert j1["panel_id"] == "cards.top_merchants"
    assert j1["rephrased"] is True
    assert j1["provider"] == "primary"
    assert j1["text"].startswith("[polished]")
    assert calls["n"] == 1

    # Second identical call should be a cache hit (no additional rephrase calls)
    r2 = client.post("/agent/describe/cards.top_merchants", json={"rephrase": True})
    assert r2.status_code == 200
    j2 = r2.json()
    assert j2["text"] == j1["text"]
    assert calls["n"] == 1

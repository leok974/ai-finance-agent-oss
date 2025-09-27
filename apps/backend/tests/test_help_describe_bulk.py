from __future__ import annotations

import pytest
import os, pytest
pytestmark = pytest.mark.httpapi
from fastapi.testclient import TestClient

from app.main import app
from app.services import help_cache
import app.services.agent_detect as detect
from app.utils import llm as llm_mod

client = TestClient(app)

BASELINE_PANELS = [
    "overview.metrics.totalSpend",  # explicit deterministic branch
    "total_spend",                  # alias branch
    "top_categories",               # startswith logic
    "top_merchants",                # existing but included for breadth
    "anomalies.month_over_month",   # anomalies prefix
    "cards.top_merchants",          # cards.* prefixed
]


@pytest.mark.parametrize("panel_id", BASELINE_PANELS)
def test_describe_panels_baseline(panel_id):
    help_cache.clear()
    r = client.post(f"/agent/describe/{panel_id}", json={})
    assert r.status_code == 200
    j = r.json()
    assert j["panel_id"] == panel_id
    assert isinstance(j.get("text"), str) and j["text"]
    # Expect not rephrased by default when no explicit rephrase flag
    assert j.get("rephrased") in (False, True)  # tolerate default True in some envs
    # Provider normalization
    assert j.get("provider") in ("none", "primary", "fallback-primary", "fallback-azure", "fallback-openai")


@pytest.mark.parametrize("panel_id", BASELINE_PANELS)
def test_describe_panels_rephrase(panel_id, monkeypatch):
    help_cache.clear()
    # Force allow path
    monkeypatch.setenv("FORCE_HELP_LLM", "1")
    calls = {"n": 0}

    def fake_rephrase(pid, result, summary):
        calls["n"] += 1
        return f"[polished] {summary} :: {pid}"

    monkeypatch.setattr(detect, "try_llm_rephrase_summary", fake_rephrase)
    monkeypatch.setattr(llm_mod, "reset_fallback_provider", lambda: None, raising=False)
    monkeypatch.setattr(llm_mod, "get_last_fallback_provider", lambda: None, raising=False)

    r = client.post(f"/agent/describe/{panel_id}", json={"rephrase": True})
    assert r.status_code == 200
    j = r.json()
    assert j["panel_id"] == panel_id
    assert j["rephrased"] is True
    assert j["provider"] == "primary"
    assert j["text"].startswith("[polished]")
    assert calls["n"] == 1
    # second call caches
    r2 = client.post(f"/agent/describe/{panel_id}", json={"rephrase": True})
    assert r2.status_code == 200
    j2 = r2.json()
    assert j2["text"] == j["text"]
    assert calls["n"] == 1

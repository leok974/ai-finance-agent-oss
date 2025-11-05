from fastapi.testclient import TestClient
from app.main import app
from app.utils import llm as llm_mod


def _fake_llm(*, model, messages, temperature=0.2, top_p=0.9):
    return "stub reply", []


def test_generic_prompt_does_not_route(monkeypatch):
    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)
    c = TestClient(app)
    r = c.post(
        "/agent/chat",
        json={
            "messages": [{"role": "user", "content": "test"}],
            "model": "gpt-oss:20b",
        },
    )
    assert r.status_code == 200
    j = r.json()
    # Should not be deterministic route; model should remain requested
    assert j.get("model") == "gpt-oss:20b"
    assert "mode" not in j


def test_bypass_with_mode_rephrase(monkeypatch):
    """When mode is a known override (e.g., 'rephrase'), the LLM path is used immediately."""
    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)
    c = TestClient(app)
    r = c.post(
        "/agent/chat",
        json={
            "messages": [{"role": "user", "content": "Summarize this month"}],
            "mode": "rephrase",
        },
    )
    assert r.status_code == 200
    j = r.json()
    # Reply should come from the fake LLM, not deterministic router
    assert j.get("reply") == "stub reply"
    assert j.get("model") == "gpt-oss:20b"  # default normalization retained
    assert isinstance(j.get("tool_trace", []), list)


def test_bypass_with_header_and_query(monkeypatch):
    """bypass_router query or X-Bypass-Router header should force the LLM path."""
    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)
    c = TestClient(app)
    # Header-based bypass
    r1 = c.post(
        "/agent/chat",
        json={"messages": [{"role": "user", "content": "hi"}]},
        headers={"X-Bypass-Router": "1"},
    )
    assert r1.status_code == 200
    assert r1.json().get("reply") == "stub reply"

    # Query-based bypass
    r2 = c.post(
        "/agent/chat?bypass_router=1",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert r2.status_code == 200
    assert r2.json().get("reply") == "stub reply"


def test_bypass_with_force_llm(monkeypatch):
    """force_llm:true should force bypass regardless of content."""
    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)
    c = TestClient(app)
    r = c.post(
        "/agent/chat",
        json={"messages": [{"role": "user", "content": "hello"}], "force_llm": True},
    )
    assert r.status_code == 200
    assert r.json().get("reply") == "stub reply"


def test_agent_rephrase_endpoint(monkeypatch):
    """The /agent/rephrase endpoint should always call the LLM path."""
    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)
    c = TestClient(app)
    r = c.post(
        "/agent/rephrase",
        json={"messages": [{"role": "user", "content": "please rephrase"}]},
    )
    assert r.status_code == 200
    j = r.json()
    assert j.get("reply") == "stub reply"
    assert isinstance(j.get("tool_trace", []), list)

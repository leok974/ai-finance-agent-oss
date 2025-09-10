import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.utils import llm as llm_mod


def _fake_llm(*, model, messages, temperature=0.2, top_p=0.9):
    return "stub reply", []


def test_generic_prompt_does_not_route(monkeypatch):
    monkeypatch.setattr(llm_mod, "call_local_llm", _fake_llm)
    c = TestClient(app)
    r = c.post("/agent/chat", json={"messages":[{"role":"user","content":"test"}], "model":"gpt-oss:20b"})
    assert r.status_code == 200
    j = r.json()
    # Should not be deterministic route; model should remain requested
    assert j.get("model") == "gpt-oss:20b"
    assert "mode" not in j

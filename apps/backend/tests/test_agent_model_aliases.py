import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.utils import llm as llm_mod

@pytest.mark.parametrize("client_model,expected_model", [
    ("gpt-oss-20b", "gpt-oss:20b"),  # dash → colon
    ("gpt-oss:20b", "gpt-oss:20b"),  # canonical
    ("gpt",         None),           # will be resolved to settings.DEFAULT_LLM_MODEL
    ("default",     None),
])
def test_agent_chat_model_aliases(monkeypatch, client_model, expected_model):
    seen = {"model": None}

    def _fake_llm(*, model, messages, temperature=0.2, top_p=0.9):
        seen["model"] = model
        return "stub reply", []

    monkeypatch.setattr(llm_mod, "call_llm", _fake_llm)

    client = TestClient(app)
    payload = {"messages":[{"role":"user","content":"alias test"}], "model": client_model}
    r = client.post("/agent/chat", json=payload)
    assert r.status_code == 200

    # If expected_model is None, router should plug in DEFAULT_LLM_MODEL
    if expected_model is None:
        from app.config import settings
        expected_model = settings.DEFAULT_LLM_MODEL

    assert seen["model"] == expected_model, f"{client_model} → {seen['model']}, expected {expected_model}"

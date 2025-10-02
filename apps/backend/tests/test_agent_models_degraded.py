import os
from fastapi.testclient import TestClient
from app.main import app
from app.utils import llm as llm_mod


def test_agent_models_fallback_on_error(monkeypatch):
    # Force llm.list_models to raise
    def _boom():
        raise RuntimeError("provider down")
    monkeypatch.setattr(llm_mod, "list_models", _boom)
    monkeypatch.setenv("DEFAULT_LLM_PROVIDER", "ollama")
    monkeypatch.setenv("DEFAULT_LLM_MODEL", "gpt-oss:20b")

    client = TestClient(app)
    r = client.get("/agent/models")
    assert r.status_code == 200
    data = r.json()
    assert data["default"]
    ids = [m["id"] for m in data["models"]]
    assert data["default"] in ids

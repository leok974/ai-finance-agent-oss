from fastapi.testclient import TestClient
from app.main import app
from app.utils import llm as llm_mod


def test_agent_models_merges_aliases(monkeypatch):
    def _fake_list():
        return {
            "provider": "ollama",
            "default": "gpt-oss:20b",
            "models": [{"id": "llama3.1:8b"}],
        }

    monkeypatch.setattr(llm_mod, "list_models", _fake_list)

    client = TestClient(app)
    r = client.get("/agent/models")
    assert r.status_code == 200
    j = r.json()
    # Aliases should be included and de-duped + default echoed
    assert j["provider"] == "ollama"
    assert j["default"] == "gpt-oss:20b"
    ids = [m["id"] for m in j["models"]]
    assert "gpt-oss:20b" in ids and "default" in ids and "llama3.1:8b" in ids

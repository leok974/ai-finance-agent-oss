import os
from fastapi.testclient import TestClient
from app.main import app

def test_force_llm_primary(monkeypatch):
    # Ensure stub mode disabled
    monkeypatch.setenv("DEV_ALLOW_NO_LLM", "0")
    client = TestClient(app)
    r = client.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "write a 3-word poem"}],
        "force_llm": True
    })
    assert r.status_code == 200, r.text
    path = r.headers.get("X-LLM-Path")
    assert path in {"primary", "fallback-openai"}
    body = r.json()
    # Should not be a stub
    assert not body.get("stub"), body
    assert body.get("reply") and isinstance(body["reply"], str) and len(body["reply"]) > 0

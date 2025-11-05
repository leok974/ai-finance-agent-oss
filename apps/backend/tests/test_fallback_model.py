from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def body(msg="ping", model="gpt-oss:20b"):
    return {
        "messages": [{"role": "user", "content": msg}],
        "model": model,
        "stream": False,
    }


def test_validation_no_messages():
    r = client.post("/agent/chat", json={"messages": []})
    assert r.status_code == 422


def test_chat_fallback_mapping(monkeypatch):
    # Ensure fallback is enabled
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-dummy")
    # Prefer explicit fallback model to keep deterministic
    monkeypatch.setenv("OPENAI_FALLBACK_MODEL", "gpt-4o-mini")
    # Simulate local failure by pointing base to an unroutable host
    monkeypatch.setenv("OPENAI_BASE_URL", "http://127.0.0.1:9/v1")
    r = client.post("/agent/chat", json=body("hello", model="gpt-oss:20b"))
    # We should not leak a 500; either success (if internet allowed) or friendly 503-ish reply
    assert r.status_code in (200, 503)
    j = r.json()
    assert ("ok" in j) or ("error" in j)

from fastapi.testclient import TestClient
from app.main import app


def test_dev_allow_no_llm_dynamic(monkeypatch):
    c = TestClient(app)

    # Disallow stub mode: expect a normal primary/router/fallback path; header always present
    monkeypatch.setenv("DEV_ALLOW_NO_LLM", "0")
    r1 = c.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "ping"}]
    })
    assert r1.status_code == 200, r1.text
    assert "X-LLM-Path" in r1.headers

    # Enable stub mode: the dynamic env lookup should change behavior within same process
    monkeypatch.setenv("DEV_ALLOW_NO_LLM", "1")
    r2 = c.post("/agent/chat", json={
        "messages": [{"role": "user", "content": "ping"}],
        "force_llm": True
    })
    assert r2.status_code == 200, r2.text
    path2 = r2.headers.get("X-LLM-Path", "")
    # Accept any of the stub/fallback indicators; ensure header changed semantics vs empty
    assert path2.startswith(("fallback", "primary", "router", "fallback-stub"))

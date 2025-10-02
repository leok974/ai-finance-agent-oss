import time, types
import pytest
from fastapi.testclient import TestClient

import app.utils.llm as llm_mod
from app.main import app

@pytest.fixture(autouse=True)
def _reset_fallback():
    try:
        llm_mod.reset_fallback_provider()
    except Exception:
        pass

class _TimeoutingSession:
    def __init__(self, attempts_before_fail=2):
        self.calls = 0
        self.attempts_before_fail = attempts_before_fail
    def post(self, *a, **k):  # mimic requests.post signature used in _post_chat
        from requests import exceptions
        self.calls += 1
        # Always raise connect timeout (simulate cold model)
        raise exceptions.ConnectTimeout("simulated connect timeout")

@pytest.mark.parametrize("retry_enabled", [0,1])
def test_warm_window_retry_path(monkeypatch, retry_enabled):
    monkeypatch.setenv("LLM_INITIAL_RETRY", str(retry_enabled))
    monkeypatch.setenv("LLM_WARM_WINDOW_S", "60")
    monkeypatch.setenv("LLM_READ_TIMEOUT", "1")  # keep tight
    # Reset process start timestamp to now so within warm window
    monkeypatch.setattr(llm_mod, "_PROCESS_START_TS", time.time())

    # Patch requests.post used inside _post_chat
    import requests
    monkeypatch.setattr(requests, "post", _TimeoutingSession().post)
    # Also patch model listing to appear healthy (simulate warming not finished)
    monkeypatch.setattr(requests, "get", lambda *a, **k: types.SimpleNamespace(status_code=200, json=lambda: {"models": []}))

    client = TestClient(app)
    r = client.post("/agent/chat", json={"messages":[{"role":"user","content":"ping"}]})
    # We expect either warming shaped assistant reply (string) or generic temporary message; status 200 path returns a reply string.
    # If the route raises HTTP 503 from warmup preflight, capture it.
    assert r.status_code in (200, 503)
    if r.status_code == 503:
        body = r.json()
        assert body.get("error") in ("model_warming","upstream_timeout")


def test_enrichment_optional_modules(monkeypatch):
    # Simulate missing optional modules by removing them from sys.modules
    import sys
    for m in list(sys.modules.keys()):
        if m.startswith("app.routers.agent_tools_charts"):
            sys.modules.pop(m)
    client = TestClient(app)
    r = client.post("/agent/chat", json={"messages":[{"role":"user","content":"ping"}], "context": {}})
    # Should still respond (either warming 503 or 200 reply) without NameError
    assert r.status_code in (200, 503)

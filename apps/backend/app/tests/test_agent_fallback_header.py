from fastapi.testclient import TestClient

from app.main import app


def test_agent_fallback_header_and_payload(monkeypatch):
    # Force stub path (deterministic) without invoking real LLM.
    monkeypatch.setenv("DEV_ALLOW_NO_LLM", "1")
    monkeypatch.setenv("TESTING", "1")

    client = TestClient(app)
    resp = client.post(
        "/agent/chat", json={"messages": [{"role": "user", "content": "hi"}]}
    )
    assert resp.status_code == 200

    hdr = resp.headers.get("X-LLM-Path")
    body = resp.json()

    # Header must always exist.
    assert hdr is not None
    # Allowed normalized paths (keep future provider names flexible by pattern):
    assert hdr.startswith("primary") or hdr.startswith("fallback-")

    if hdr == "primary":
        assert "fallback" not in body
    else:
        # body fallback should match header suffix
        # e.g. header fallback-openai => body["fallback"] == "openai"
        assert body.get("fallback") == hdr.split("fallback-")[-1]

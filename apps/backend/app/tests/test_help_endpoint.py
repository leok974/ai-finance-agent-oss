import os, json
import pytest

pytestmark = pytest.mark.httpapi

# Ensure deterministic settings for tests
os.environ.setdefault("HELP_TTL_SECONDS", "60")
os.environ.setdefault("REPHRASE_VERSION", "testv1")
os.environ.setdefault("PRIMARY_MODEL_TAG", "test-model")

def test_help_what_basic(client):
    r = client.post("/help", json={
        "card_id": "overview",
        "mode": "what",
        "month": "2025-09",
        "deterministic_ctx": {"total": 123.45}
    })
    assert r.status_code == 200, r.text
    etag = r.headers.get("etag")
    body = r.json()
    assert body["mode"] == "what"
    assert body["source"] == "deterministic"
    assert "total" not in body["text"].lower()  # text comes from static map

    # Second request with If-None-Match -> 304
    r2 = client.post("/help", headers={"If-None-Match": etag}, json={
        "card_id": "overview",
        "mode": "what",
        "month": "2025-09",
        "deterministic_ctx": {"total": 123.45}
    })
    assert r2.status_code == 304


def test_help_why_llm_fallback(monkeypatch, client):
    # Force call_local_llm to raise to exercise fallback path
    import app.routers.help as help_router

    def boom(*a, **k):
        raise RuntimeError("llm down")

    monkeypatch.setattr(help_router, "call_local_llm", boom)

    r = client.post("/help", json={
        "card_id": "overview",
        "mode": "why",
        "month": None,
        "deterministic_ctx": {"total": 200},
        "base_text": "Total spend is up 10%"
    })
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "why"
    assert data["source"] == "fallback"
    assert "temporary" in data["text"].lower()
    assert "llm down" in data.get("error", "")

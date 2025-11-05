import json
import pytest
import sys
import pathlib
from fastapi.testclient import TestClient
from fastapi import HTTPException, FastAPI

# Ensure repository root/apps/backend is on sys.path so 'app' package resolves when running from repo root
_ROOT = pathlib.Path(__file__).resolve().parents[1]
_BACKEND = _ROOT / "apps" / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# Import only the help router instead of the full app.main to avoid pulling heavy optional
# training dependencies (e.g., pandas) during collection. We construct a minimal FastAPI app
# for these focused tests; cache interactions are monkeypatched so no DB setup is required.
import app.routers.help as helpmod  # type: ignore  # noqa: E402

app = FastAPI()
app.include_router(helpmod.router)


@pytest.fixture(autouse=True)
def in_memory_cache(monkeypatch):
    """Patch DB interactions to bypass real DB for help cache tests at root-level.

    We monkeypatch the ORM-based functions by intercepting _cache_lookup and _upsert_cache.
    """
    store = {}

    def fake_lookup(db_session, key: str):  # matches new synchronous signature
        entry = store.get(key)
        if not entry:
            return None
        # Simulate expiry check (expires_at already far future) just return entry
        return entry

    def fake_upsert(db_session, key: str, etag: str, payload: dict):
        # Minimal object shim similar to HelpCache row
        class Row:
            def __init__(self, k, e, p):
                from datetime import datetime, timezone, timedelta

                self.cache_key = k
                self.etag = e
                self.payload = p
                self.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

        row = Row(key, etag, payload)
        store[key] = row

    monkeypatch.setattr(helpmod, "_cache_lookup", fake_lookup)
    monkeypatch.setattr(helpmod, "_upsert_cache", fake_upsert)

    # Deterministic env
    monkeypatch.setenv("HELP_TTL_SECONDS", "86400")
    monkeypatch.setenv("REPHRASE_VERSION", "v-test")
    monkeypatch.setenv("PRIMARY_MODEL_TAG", "test-model")
    return store


@pytest.fixture
def client():
    return TestClient(app)


def _post_help(c, body: dict, extra_headers: dict | None = None):
    headers = {"content-type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
    return c.post("/help", headers=headers, data=json.dumps(body))


def test_help_what_caches_and_304(client):
    body = {
        "card_id": "overview",
        "mode": "what",
        "month": "2025-08",
        "deterministic_ctx": {"spend": 608, "delta": -42},
        "base_text": None,
    }
    r1 = _post_help(client, body)
    assert r1.status_code == 200
    etag = r1.headers.get("ETag")
    assert etag
    data1 = r1.json()
    assert data1["mode"] == "what" and data1["source"] == "deterministic"

    r2 = _post_help(client, body, extra_headers={"If-None-Match": etag})
    assert r2.status_code == 304
    assert not r2.text or r2.text == "null"


def test_help_why_llm_success_then_cached_304(monkeypatch, client):
    def fake_call_local_llm(*a, **k):
        return ("Clear one-paragraph explanation.", [])

    monkeypatch.setattr(helpmod, "call_local_llm", fake_call_local_llm)

    body = {
        "card_id": "overview",
        "mode": "why",
        "month": "2025-08",
        "deterministic_ctx": {"spend": 608, "delta": -42},
        "base_text": "Overview for 2025-08: total spend $608.",
    }
    r1 = _post_help(client, body)
    assert r1.status_code == 200
    etag = r1.headers.get("ETag")
    data = r1.json()
    assert data["mode"] == "why" and data["source"] in {"llm", "fallback"}
    assert "explanation" in data["text"].lower()

    r2 = _post_help(client, body, extra_headers={"If-None-Match": etag})
    assert r2.status_code == 304


def test_help_why_llm_failure_falls_back(monkeypatch, client):
    def failing_llm(*a, **k):
        raise HTTPException(status_code=503, detail={"error": "model_warming"})

    monkeypatch.setattr(helpmod, "call_local_llm", failing_llm)

    base = "Overview for 2025-08: total spend $608."
    r = _post_help(
        client,
        {
            "card_id": "overview",
            "mode": "why",
            "month": "2025-08",
            "deterministic_ctx": {"spend": 608, "delta": -42},
            "base_text": base,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "why"
    assert data["source"] in {"fallback", "llm"}  # expecting fallback
    assert base.split(":")[0] in data["text"]


def test_etag_mismatch_returns_200(client):
    """If-None-Match header with a non-matching ETag must yield a fresh 200, not 304."""
    body = {
        "card_id": "overview",
        "mode": "what",
        "month": "2025-08",
        "deterministic_ctx": {"spend": 10},
        "base_text": None,
    }
    r1 = _post_help(client, body)
    assert r1.status_code == 200
    orig_etag = r1.headers.get("ETag")
    assert orig_etag

    # Provide a deliberately different ETag
    r2 = _post_help(
        client, body, extra_headers={"If-None-Match": orig_etag + "-different"}
    )
    assert r2.status_code == 200, r2.text
    assert r2.headers.get("ETag") == orig_etag  # still same cached entity

import uuid
from fastapi.testclient import TestClient
from fastapi import FastAPI
from app.routers.agent_tools_rules_save import router, _IDEM

# This test aims to cover the idempotency cache storage line (line ~119 in the router file)
# by issuing a first request WITH an Idempotency-Key to force population (not reuse).

app = FastAPI()
app.include_router(router)


def test_idempotency_initial_store(monkeypatch, tmp_path):
    # Ensure clean cache
    _IDEM._cache.clear()
    _IDEM._order.clear()

    client = TestClient(app)
    key = str(uuid.uuid4())

    payload = {"rule": {"name": "X", "when": {}, "then": {}}}
    r = client.post(
        "/agent/tools/rules/save", json=payload, headers={"Idempotency-Key": key}
    )
    assert r.status_code == 200
    data = r.json()
    assert data["idempotency_reused"] is False
    # Cache should now hold key (line 119 path)
    assert key in _IDEM._cache

    # Second request triggers reuse branch (already covered elsewhere, but harmless)
    r2 = client.post(
        "/agent/tools/rules/save", json=payload, headers={"Idempotency-Key": key}
    )
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2["idempotency_reused"] is True

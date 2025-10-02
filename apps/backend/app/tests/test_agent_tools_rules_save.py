from fastapi.testclient import TestClient

try:
    from app.main import app
except Exception:  # pragma: no cover
    raise SystemExit("Cannot import app.main.app for tests")

client = TestClient(app)

def test_save_rule_json_fallback_and_idempotency():
    payload = {
        "rule": {
            "name": "Auto: Forecast 10% cut",
            "when": {"category": "Groceries"},
            "then": {"category": "Groceries"},
        },
        "month": "2025-08",
    }
    idem = "test-idem-123"

    r1 = client.post("/agent/tools/rules/save", json=payload, headers={"Idempotency-Key": idem})
    assert r1.status_code == 200, r1.text
    data1 = r1.json()
    assert data1["ok"] is True
    assert data1["id"]
    assert data1["display_name"].startswith("Auto:")

    r2 = client.post("/agent/tools/rules/save", json=payload, headers={"Idempotency-Key": idem})
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2["id"] == data1["id"]
    assert data2["idempotency_reused"] is True

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Import your router & DB dep
from app.routers.rules import router as rules_router
from app.database import get_db


# ---- Test app wiring (standalone; no full app needed) ----
@pytest.fixture(scope="session")
def test_app():
    app = FastAPI()
    app.include_router(rules_router)
    return app


@pytest.fixture()
def client(test_app):
    # Override DB dependency with a harmless stub
    test_app.dependency_overrides[get_db] = lambda: None
    with TestClient(test_app) as c:
        yield c
    test_app.dependency_overrides.clear()


# ---- Helpers ----
def payload(
    month="2025-09", name="Streaming", like="NETFLIX", category="Subscriptions"
):
    return {
        "rule": {
            "name": name,
            "when": {"description_like": like},
            "then": {"category": category},
        },
        "month": month,
    }


# ---- Tests ----


def test_save_train_reclass_happy_path(monkeypatch, client):
    # Stub services
    class FakeRule:  # if your real service returns ORM, this is enough
        id = 123

    created_called = {"count": 0}
    trained_called = {"count": 0}
    reclass_called = {"count": 0}

    def fake_create_rule(db, rule_input):
        created_called["count"] += 1
        return FakeRule()

    def fake_retrain_model(db):
        trained_called["count"] += 1

    def fake_reclassify_transactions(db, month=None):
        reclass_called["count"] += 1
        assert month == "2025-09"
        return 7

    # Monkeypatch into the modules your router imports
    import app.services.rules_service as rules_service
    import app.services.ml_train_service as ml_train_service
    import app.services.txns_service as txns_service

    monkeypatch.setattr(rules_service, "create_rule", fake_create_rule)
    monkeypatch.setattr(ml_train_service, "retrain_model", fake_retrain_model)
    monkeypatch.setattr(
        txns_service, "reclassify_transactions", fake_reclassify_transactions
    )

    resp = client.post("/rules/save-train-reclass", json=payload())
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data == {"rule_id": "123", "reclassified": 7}
    assert created_called["count"] == 1
    assert trained_called["count"] == 1
    assert reclass_called["count"] == 1


def test_training_failure_is_non_fatal(monkeypatch, client):
    class FakeRule:
        id = 42

    def fake_create_rule(db, rule_input):
        return FakeRule()

    def fake_retrain_model(db):
        raise RuntimeError("boom")

    def fake_reclassify_transactions(db, month=None):
        return 0

    import app.services.rules_service as rules_service
    import app.services.ml_train_service as ml_train_service
    import app.services.txns_service as txns_service

    monkeypatch.setattr(rules_service, "create_rule", fake_create_rule)
    monkeypatch.setattr(ml_train_service, "retrain_model", fake_retrain_model)
    monkeypatch.setattr(
        txns_service, "reclassify_transactions", fake_reclassify_transactions
    )

    resp = client.post("/rules/save-train-reclass", json=payload())
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"rule_id": "42", "reclassified": 0}


def test_invalid_month_rejected(monkeypatch, client):
    # Minimal stubs (should not be called because validation fails first)
    import app.services.rules_service as rules_service
    import app.services.ml_train_service as ml_train_service
    import app.services.txns_service as txns_service

    monkeypatch.setattr(rules_service, "create_rule", lambda db, r: None)
    monkeypatch.setattr(ml_train_service, "retrain_model", lambda db: None)
    monkeypatch.setattr(
        txns_service, "reclassify_transactions", lambda db, month=None: 0
    )

    bad = payload(month="2025-13")  # invalid
    resp = client.post("/rules/save-train-reclass", json=bad)
    assert resp.status_code == 422
    assert "month" in resp.text


def test_missing_category_rejected(monkeypatch, client):
    # Category is required in schema (then.category)
    bad = payload(category=None)
    resp = client.post("/rules/save-train-reclass", json=bad)
    assert resp.status_code == 422
    # FastAPI/Pydantic will explain "field required" or min_length failure
    assert "category" in resp.text

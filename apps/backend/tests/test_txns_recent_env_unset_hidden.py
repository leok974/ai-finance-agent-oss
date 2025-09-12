import os
from datetime import date
from fastapi.testclient import TestClient

from app.main import app
from app.db import get_db
from app.models import Transaction
from app.utils import env

def _override_db(db_session):
    def _get_db():
        yield db_session
    app.dependency_overrides[get_db] = _get_db

def _seed_txn(db_session):
    t = Transaction(
        date=date(2025, 8, 15),
        amount=-9.99,
    description="Café—Gamma latte hidden",
        merchant="Café—Gamma",
        account="acc",
        month="2025-08",
        category=None,
        raw_category=None,
    )
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return t

def test_txns_recent_hides_merchant_canonical_when_env_unset(db_session, monkeypatch):
    _override_db(db_session)
    _seed_txn(db_session)

    # Unset ENV entirely to simulate default environment
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ENV", raising=False)
    assert env.get_env() == "prod"

    client = TestClient(app)
    resp = client.get("/txns/recent?limit=1")
    assert resp.status_code == 200
    items = resp.json()
    assert isinstance(items, list) and len(items) >= 1

    row = items[0]
    # Core fields still present
    assert "merchant" in row and "description" in row
    # DEV-only field must be hidden by default when ENV is unset
    assert "merchant_canonical" not in row

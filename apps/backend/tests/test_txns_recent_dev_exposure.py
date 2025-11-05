from datetime import date
from fastapi.testclient import TestClient

from app.main import app
from app.db import get_db
from app.models import Transaction
from app.utils import env


# Helper: make API use the same db_session fixture
def _override_db(db_session):
    def _get_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_db


def _seed_txn(db_session, merchant="Café—Gamma", desc="Café—Gamma latte"):
    t = Transaction(
        date=date(2025, 8, 15),
        amount=-9.99,
        description=desc,
        merchant=merchant,
        account="acc",
        month="2025-08",
        category=None,
        raw_category=None,
    )
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return t


def test_txns_recent_hides_merchant_canonical_in_prod(db_session, monkeypatch):
    _override_db(db_session)
    _seed_txn(db_session)

    # Simulate non-dev / production mode
    # Adjust the variable to whatever your code checks (e.g., APP_ENV / ENV / VITE_ENV)
    monkeypatch.setenv("APP_ENV", "prod")
    assert env.is_prod()
    # If your route uses another flag, set it here as well:
    # monkeypatch.setenv("EXPOSE_DEV_FIELDS", "0")

    client = TestClient(app)
    resp = client.get("/txns/recent?limit=1")
    assert resp.status_code == 200
    items = resp.json()
    assert isinstance(items, list) and len(items) >= 1

    row = items[0]
    # Core fields present
    assert "merchant" in row and "description" in row
    # DEV-only field must be hidden in prod
    assert "merchant_canonical" not in row


def test_txns_recent_exposes_merchant_canonical_in_dev(db_session, monkeypatch):
    _override_db(db_session)
    _seed_txn(db_session, merchant="Café—Gamma", desc="Café—Gamma latte unique")

    # Simulate dev mode
    monkeypatch.setenv("APP_ENV", "dev")
    assert env.is_dev()
    # If your code checks a different flag, set it accordingly:
    # monkeypatch.setenv("EXPOSE_DEV_FIELDS", "1")

    client = TestClient(app)
    resp = client.get("/txns/recent?limit=1")
    assert resp.status_code == 200
    items = resp.json()
    assert isinstance(items, list) and len(items) >= 1

    row = items[0]
    # DEV-only field should appear
    assert "merchant_canonical" in row
    # And be the canonicalized form
    assert row["merchant_canonical"] == "cafe gamma"

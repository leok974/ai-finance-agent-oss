"""Deterministic tests for /charts/month_summary in onboarding / in-memory mode.

These tests isolate a brand-new in-memory SQLite DB per test module so that
DB fallback logic never interferes with validating the in-memory path or
the empty-state contract.
"""

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.utils.auth import get_current_user
import app.db as app_db
from app.db import Base, get_db


@pytest.fixture()
def isolated_db(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(
        bind=engine, autoflush=False, autocommit=False, future=True
    )

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    # Patch global engine/session for any direct imports
    monkeypatch.setattr(app_db, "engine", engine, raising=False)
    monkeypatch.setattr(app_db, "SessionLocal", SessionLocal, raising=False)
    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(engine)


@pytest.fixture()
def client(isolated_db):  # explicit override chain per test here
    app.dependency_overrides[get_current_user] = lambda: object()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_current_user, None)


def test_month_summary_empty_returns_null_payload(client):
    # Ensure in-memory is empty
    app.state.txns = []
    r = client.get("/charts/month_summary")
    assert (
        r.status_code == 200
    )  # With no DB rows & no in-memory, we return null/zero payload
    data = r.json()
    assert data.get("month") in (None, "", "null")
    assert data.get("total_spend") in (0, 0.0)
    assert data.get("total_income") in (0, 0.0)
    assert data.get("net") in (0, 0.0)


def test_month_summary_with_inmemory_defaults_to_latest(client):
    sample = [
        {
            "id": 1,
            "date": "2099-10-30",
            "amount": 100.00,
            "merchant": "ACME",
            "description": "Rebate",
            "category": "Income",
        },
        {
            "id": 2,
            "date": "2099-11-02",
            "amount": 82.45,
            "merchant": "Stripe",
            "description": "Payout",
            "category": "Income",
        },
        {
            "id": 3,
            "date": "2099-11-05",
            "amount": -30.00,
            "merchant": "Grocer",
            "description": "Food",
            "category": "Groceries",
        },
        {
            "id": 4,
            "date": "2099-11-07",
            "amount": -12.50,
            "merchant": "Chipotle",
            "description": "Burrito",
            "category": "Dining",
        },
    ]
    app.state.txns = list(sample)
    r = client.get("/charts/month_summary")
    assert r.status_code == 200
    data = r.json()
    assert data["month"] == "2099-11"  # latest month from sample
    assert round(float(data["total_income"]), 2) == 82.45
    assert round(float(data["total_spend"]), 2) == 42.5
    assert round(float(data["net"]), 2) == round(82.45 - 42.5, 2)
    cats = {c["name"]: c["amount"] for c in data.get("categories", [])}
    assert round(cats.get("Groceries", 0.0), 2) == 30.0
    assert round(cats.get("Dining", 0.0), 2) == 12.5


def test_month_summary_no_leakage_after_clearing(client):
    populated = [
        {
            "id": 10,
            "date": "2099-12-01",
            "amount": 500.0,
            "merchant": "Stripe",
            "category": "Income",
        },
        {
            "id": 11,
            "date": "2099-12-03",
            "amount": -42.0,
            "merchant": "Market",
            "category": "Groceries",
        },
    ]
    app.state.txns = list(populated)
    r1 = client.get("/charts/month_summary")
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1.get("month") == "2099-12"
    assert d1.get("total_income") == 500.0
    assert d1.get("total_spend") == 42.0

    # Clear and re-query
    app.state.txns = []
    r2 = client.get("/charts/month_summary")
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2.get("month") in (None, "", "null")
    assert d2.get("total_income") in (0, 0.0)
    assert d2.get("total_spend") in (0, 0.0)
    assert d2.get("net") in (0, 0.0)

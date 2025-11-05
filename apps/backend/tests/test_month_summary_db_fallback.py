import os
from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
import app.db as app_db
from app.db import Base, get_db
from app import orm_models as models
from app.utils.auth import get_current_user


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

    monkeypatch.setattr(app_db, "engine", engine, raising=False)
    monkeypatch.setattr(app_db, "SessionLocal", SessionLocal, raising=False)
    app.dependency_overrides[get_db] = _override_get_db
    yield SessionLocal
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(engine)


@pytest.fixture()
def client(isolated_db):
    app.dependency_overrides[get_current_user] = lambda: object()
    with TestClient(app) as c:
        yield c, isolated_db  # return SessionLocal factory too
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.integration
def test_month_summary_db_fallback_uses_db_when_memory_empty(client):
    (c, SessionLocal) = client
    os.environ["DISABLE_STATE_PERSIST"] = "1"
    # Ensure in-memory empty
    app.state.txns = []

    # Seed DB with two distinct future months
    db = SessionLocal()
    try:
        rows = [
            models.Transaction(
                id=9001,
                date=date(2099, 11, 15),
                amount=-10.0,
                merchant="Coffee",
                category="Dining",
            ),
            models.Transaction(
                id=9002,
                date=date(2099, 12, 3),
                amount=100.0,
                merchant="Stripe",
                category="Income",
            ),
            models.Transaction(
                id=9003,
                date=date(2099, 12, 5),
                amount=-25.0,
                merchant="Store",
                category="Groceries",
            ),
        ]
        db.add_all(rows)
        db.commit()
    finally:
        db.close()

    r = c.get("/charts/month_summary")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("month") == "2099-12"
    assert round(float(data.get("total_income", -1)), 2) == 100.0
    # Category aggregation (expenses). Depending on heuristics some small rows may be filtered; ensure Groceries recorded.
    cats = {c["name"]: c["amount"] for c in data.get("categories", [])}
    assert round(cats.get("Groceries", 0.0), 2) == 25.0
    # total_spend should equal sum of category magnitudes returned
    assert round(float(data.get("total_spend", -1)), 2) == round(sum(cats.values()), 2)
    assert round(float(data.get("net", -999)), 2) == round(
        100.0 - float(data.get("total_spend", 0.0)), 2
    )

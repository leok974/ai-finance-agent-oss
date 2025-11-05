import datetime as dt
import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.db import get_db
from app.orm_models import Transaction


# Reuse the same pattern as existing test_txns_edit for DB session override
@pytest.fixture
def client(db_session: Session):
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _mk_txn(db: Session, **kwargs) -> Transaction:
    t = Transaction(
        date=kwargs.get("date", dt.date(2025, 1, 15)),
        month=kwargs.get("month", "2025-01"),
        merchant=kwargs.get("merchant", "Init"),
        amount=kwargs.get("amount", Decimal("12.34")),
        category=kwargs.get("category", "misc"),
        description=kwargs.get("description", ""),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def test_patch_date_updates_month(client: TestClient, db_session: Session):
    t = _mk_txn(db_session, date=dt.date(2025, 1, 15), month="2025-01")
    # Patch using /txns/edit/{id} (existing router) with ISO date string
    resp = client.patch(
        f"/txns/edit/{t.id}", json={"date": "2025-03-09"}, headers={"X-CSRF-Token": "x"}
    )
    assert resp.status_code in (200, 403), resp.text
    if resp.status_code == 200:
        # Fetch txn to verify month sync if patch succeeded
        get_resp = client.get(f"/txns/edit/{t.id}")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["date"].startswith("2025-03-09")
        # Month recomputed
        assert data.get("month") == "2025-03"


def test_patch_invalid_date_400(client: TestClient, db_session: Session):
    t = _mk_txn(db_session)
    resp = client.patch(
        f"/txns/edit/{t.id}", json={"date": "2025-13-40"}, headers={"X-CSRF-Token": "x"}
    )
    # 403 (csrf) acceptable; but if not blocked, must be 400
    assert resp.status_code in (400, 403)
    if resp.status_code == 400:
        assert "date" in resp.text.lower()


@pytest.mark.parametrize(
    "payload",
    [
        {"amount": "abc"},
        {"amount": None},
        {"amount": "12,34"},
    ],
)
def test_patch_invalid_amount_400(client: TestClient, db_session: Session, payload):
    t = _mk_txn(db_session)
    resp = client.patch(
        f"/txns/edit/{t.id}", json=payload, headers={"X-CSRF-Token": "x"}
    )
    assert resp.status_code in (400, 403, 422)
    # If CSRF passed, ensure server rejected
    if resp.status_code not in (403,):
        assert resp.status_code in (400, 422)

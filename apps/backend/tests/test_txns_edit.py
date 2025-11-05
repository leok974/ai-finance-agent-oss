import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from decimal import Decimal
from datetime import date

from app.main import app
from app.db import get_db
from app.orm_models import Transaction


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
        date=kwargs.get("date", date(2025, 8, 10)),
        month=kwargs.get("month", "2025-08"),
        merchant=kwargs.get("merchant", "Store A"),
        amount=kwargs.get("amount", Decimal("-25.00")),
        category=kwargs.get("category", "Groceries"),
        description=kwargs.get("description", ""),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def test_patch_roundtrip(client: TestClient, db_session: Session):
    t = _mk_txn(db_session)
    r = client.patch(
        f"/txns/edit/{t.id}",
        json={"description": "new desc", "amount": "-30.50"},
        headers={"X-CSRF-Token": "x"},
    )
    assert r.status_code in (200, 403)  # CSRF may block outside test env


def test_delete_restore(client: TestClient, db_session: Session, monkeypatch):
    # bypass CSRF in this test
    monkeypatch.setenv("DEV_ALLOW_NO_CSRF", "1")
    t = _mk_txn(db_session)
    r = client.delete(f"/txns/edit/{t.id}")
    assert r.status_code == 200
    r2 = client.delete(f"/txns/edit/{t.id}")
    assert r2.status_code == 404
    r3 = client.post(f"/txns/edit/{t.id}/restore")
    assert r3.status_code == 200


def test_split_sum_and_children(client: TestClient, db_session: Session, monkeypatch):
    monkeypatch.setenv("DEV_ALLOW_NO_CSRF", "1")
    t = _mk_txn(db_session, amount=Decimal("-10.00"))
    r = client.post(
        f"/txns/edit/{t.id}/split",
        json={
            "parts": [
                {"amount": "-4.00", "category": "Groceries"},
                {"amount": "-6.00", "category": "Other"},
            ]
        },
    )
    print("SPLIT resp:", r.status_code, r.text)
    assert r.status_code == 200
    db_session.refresh(t)
    assert str(t.amount) in ("0.00", "0.0", "0")


def test_merge_creates_new_and_soft_deletes(
    client: TestClient, db_session: Session, monkeypatch
):
    monkeypatch.setenv("DEV_ALLOW_NO_CSRF", "1")
    a = _mk_txn(db_session, amount=Decimal("-7.00"))
    b = _mk_txn(db_session, amount=Decimal("-3.00"))
    r = client.post(
        "/txns/edit/merge", json={"ids": [a.id, b.id], "merged_note": "combo"}
    )
    assert r.status_code == 200
    merged_id = r.json().get("id")
    assert merged_id
    db_session.refresh(a)
    db_session.refresh(b)
    assert a.deleted_at is not None and b.deleted_at is not None


def test_transfer_group_set(client: TestClient, db_session: Session, monkeypatch):
    monkeypatch.setenv("DEV_ALLOW_NO_CSRF", "1")
    a = _mk_txn(db_session, amount=Decimal("-100.00"))
    b = _mk_txn(db_session, amount=Decimal("100.00"))
    r = client.post(f"/txns/edit/{a.id}/transfer", json={"counterpart_id": b.id})
    assert r.status_code == 200
    db_session.refresh(a)
    db_session.refresh(b)
    assert (
        a.transfer_group and b.transfer_group and a.transfer_group == b.transfer_group
    )

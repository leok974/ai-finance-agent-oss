import pytest
from datetime import datetime, timezone
from uuid import uuid4

def _mk_txn(db, merchant="Starbucks", amount=-5.0):
    from app.transactions import Transaction
    today = datetime.now(timezone.utc).date()
    row = Transaction(
        date=today,
        merchant=merchant,
        description=f"{merchant} test-{uuid4().hex[:8]}",
        amount=amount,
        category=None,
        raw_category=None,
        account="test",
        month=today.strftime("%Y-%m"),
    )
    db.add(row)
    db.flush()
    db.commit()
    return row

def _accept(client, txn_id, merchant, category):
    return client.post("/ml/feedback", json={
        "txn_id": txn_id,
        "merchant": merchant,
        "category": category,
        "action": "accept",
    })

def test_list_suggestions_after_threshold(client, db_session):
    txn = _mk_txn(db_session, merchant="Blue Bottle")
    for _ in range(3):
        r = _accept(client, txn.id, "Blue Bottle #001", "Coffee")
        assert r.status_code == 200

    # list suggestions
    r = client.get("/rules/suggestions?merchant_norm=blue bottle 001&category=Coffee")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    assert len(items) >= 1
    sug = items[0]
    assert sug["merchant_norm"].startswith("blue bottle")
    assert sug["category"] == "Coffee"
    assert sug["support"] >= 3
    assert 0.0 <= sug["positive_rate"] <= 1.0

def test_accept_suggestion_creates_rule(client, db_session):
    txn = _mk_txn(db_session, merchant="Pret A Manger")
    for _ in range(3):
        r = _accept(client, txn.id, "Pret A Manger #42", "Lunch")
        assert r.status_code == 200

    # fetch list & choose first suggestion
    r = client.get("/rules/suggestions?merchant_norm=pret a manger 42&category=Lunch")
    sug = r.json()[0]
    sug_id = sug["id"]

    # accept it (should create a rule)
    r = client.post(f"/rules/suggestions/{sug_id}/accept")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "rule_id" in body

def test_dismiss_suggestion(client, db_session):
    txn = _mk_txn(db_session, merchant="Costa Coffee")
    for _ in range(3):
        r = _accept(client, txn.id, "Costa Coffee - Canary", "Coffee")
        assert r.status_code == 200

    r = client.get("/rules/suggestions?merchant_norm=costa coffee - canary&category=Coffee")
    sug_id = r.json()[0]["id"]

    r = client.post(f"/rules/suggestions/{sug_id}/dismiss")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True

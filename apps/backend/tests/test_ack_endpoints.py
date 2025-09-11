from datetime import date


def _make_txn(db, merchant: str, amount: float = -10.0, description: str = "Test", category: str | None = None):
    from app.orm_models import Transaction
    t = Transaction(
        date=date(2025, 8, 5),
        merchant=merchant,
        description=description,
        amount=amount,
        category=category,
        month="2025-08",
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def test_suggestions_accept_returns_ack(client, db_session):
    # Seed a single uncategorized txn
    t = _make_txn(db_session, merchant="Local Coffee Shop", category=None)

    # Accept suggestion for that txn
    body = {"txn_id": t.id, "category": "Dining out", "apply_to_similar": False}
    r = client.post("/suggestions/accept", json=body)
    assert r.status_code == 200, r.text
    j = r.json()

    # Ack presence and shape
    assert j.get("ok") is True
    assert "ack" in j and isinstance(j["ack"], dict)
    assert isinstance(j["ack"].get("deterministic"), str) and j["ack"]["deterministic"].strip()

    # DB updated
    db_session.refresh(t)
    assert t.category == "Dining out"


def test_rules_test_apply_returns_ack(client, db_session, monkeypatch):
    # Seed a couple txns for the merchant so backfill updates > 0
    _ = _make_txn(db_session, merchant="NETFLIX", category=None, description="NETFLIX.COM")
    _ = _make_txn(db_session, merchant="Netflix", category=None, description="NETFLIX *SUBS")

    body = {"merchant": "NETFLIX", "category": "Subscriptions", "enabled": True, "backfill": True}
    r = client.post("/rules/test/apply", json=body)
    assert r.status_code == 200, r.text
    j = r.json()

    # Ack presence and shape
    assert j.get("ok") is True
    assert "ack" in j and isinstance(j["ack"], dict)
    assert isinstance(j["ack"].get("deterministic"), str) and j["ack"]["deterministic"].strip()

    # Should report updated count (>= 1 when backfill present)
    assert isinstance(j.get("updated"), int)
    assert j["updated"] >= 1

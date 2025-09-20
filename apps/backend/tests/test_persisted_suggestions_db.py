from datetime import datetime, timedelta, date
from app.utils.time import utc_now

def seed_feedback(db):
    from app.orm_models import Feedback, Transaction
    now = utc_now()
    # Seed a transaction to attach feedback to
    t = Transaction(date=date(2025, 8, 5), merchant="Starbucks", description="Latte", amount=-5.5, category=None, raw_category=None, account=None, month="2025-08")
    db.add(t); db.flush()
    # Create feedback rows pointing to the txn
    for i in range(3):
        db.add(Feedback(txn_id=t.id, label="Dining out", source="accept_suggestion", created_at=now - timedelta(days=2*i)))
    db.commit()

def test_persisted_autofill_accept_dismiss_db(client, db_session):
    seed_feedback(db_session)

    r = client.get("/rules/suggestions/persistent?autofill=true").json()
    assert r["suggestions"], "should autofill from mined"
    star = next(s for s in r["suggestions"] if s["merchant"].lower() == "starbucks")
    sid = star["id"]

    a = client.post(f"/rules/suggestions/{sid}/accept").json()
    # Accept may return { ok, rule_id } when DB-backed path hits; allow both shapes
    assert (a.get("status") == "accepted") or ("rule_id" in a)

    d = client.post(f"/rules/suggestions/{sid}/dismiss").json()
    assert (d.get("status") == "dismissed") or (d.get("ok") is True)

    r2 = client.post("/rules/suggestions/persistent/refresh").json()
    assert any(s["id"] == sid for s in r2["suggestions"])

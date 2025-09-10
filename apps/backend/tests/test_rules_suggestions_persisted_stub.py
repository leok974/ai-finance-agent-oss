from datetime import datetime, timedelta, date


def seed_feedback(db):
    from app.orm_models import Feedback, Transaction
    now = datetime.utcnow()
    # Create a transaction to attach feedback to
    t = Transaction(date=date(2025, 8, 6), merchant="Starbucks", category="", amount=-5.0, description="Coffee")
    db.add(t)
    db.commit()
    db.refresh(t)
    for i in range(3):
        fb = Feedback(txn_id=t.id, label="Dining out", created_at=now - timedelta(days=i * 3), source="accept")
        db.add(fb)
    db.commit()


def test_persisted_autofill_accept_dismiss(client, db_session):
    seed_feedback(db_session)

    # Autofill on first GET
    r = client.get("/rules/suggestions/persistent?autofill=true").json()
    assert "suggestions" in r and len(r["suggestions"]) >= 1
    sug = next(s for s in r["suggestions"] if s.get("merchant", "").lower() == "starbucks")

    # Accept it
    sid = sug["id"]
    r2 = client.post(f"/rules/suggestions/{sid}/accept").json()
    assert r2["status"] == "accepted"

    # Dismiss it
    r3 = client.post(f"/rules/suggestions/{sid}/dismiss").json()
    assert r3["status"] == "dismissed"

    # Refresh does not delete dismissed by default; count should still be present
    r4 = client.post("/rules/suggestions/persistent/refresh").json()
    ids = [x["id"] for x in r4["suggestions"]]
    assert sid in ids

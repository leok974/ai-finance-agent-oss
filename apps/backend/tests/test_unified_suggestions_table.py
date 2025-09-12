from datetime import datetime, timedelta, date

def seed_feedback(db):
    from app.orm_models import Feedback, Transaction
    now = datetime.utcnow()
    # Transaction to link feedback
    t = Transaction(date=date(2025,8,6), merchant="Starbucks", description="Latte", amount=-5.0, category=None, raw_category=None, account=None, month="2025-08")
    db.add(t); db.flush()
    for i in range(3):
        db.add(Feedback(txn_id=t.id, label="Dining out", source="accept_suggestion", created_at=now - timedelta(days=2*i)))
    db.commit()


def test_unified_table_autofill_and_status(client, db_session):
    seed_feedback(db_session)

    # Autofill from mined
    r = client.get("/rules/suggestions/persistent?autofill=true").json()
    assert r["suggestions"], "expected mined suggestions to be upserted"
    sug = next(s for s in r["suggestions"] if s["merchant"].lower() == "starbucks")
    assert sug["source"] in ("mined", "persisted")

    sid = sug["id"]
    a = client.post(f"/rules/suggestions/{sid}/accept").json()
    assert a["status"] == "accepted"

    d = client.post(f"/rules/suggestions/{sid}/dismiss").json()
    assert d["status"] == "dismissed"

    # refresh preserves row; mined upsert should not overwrite dismissed status
    r2 = client.post("/rules/suggestions/persistent/refresh").json()
    ids = [x["id"] for x in r2["suggestions"]]
    assert sid in ids
    refreshed = next(x for x in r2["suggestions"] if x["id"] == sid)
    assert refreshed["status"] == "dismissed"

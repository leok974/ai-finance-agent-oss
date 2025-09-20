from datetime import datetime, date, timedelta
from app.utils.time import utc_now


def seed_feedback(db):
    from app.orm_models import Feedback, Transaction
    now = utc_now()
    # 3 confirmations for Starbucks -> Dining out within the window
    for i in range(3):
        # Create a transaction first to satisfy FK
        t = Transaction(
            date=date(2025, 8, 5 + i),
            merchant="STARBUCKS #1234" if i == 0 else "Starbucks",
            description="Coffee",
            amount=-4.5,
            category=None,
            month=f"{2025:04d}-{8:02d}",
        )
        db.add(t)
        db.flush()
        db.add(
            Feedback(
                txn_id=t.id,
                label="Dining out",
                source="accept_suggestion",
                created_at=now - timedelta(days=i * 5),
            )
        )
    db.commit()


def test_list_and_apply_suggestions(client, db_session):
    seed_feedback(db_session)

    res = client.get("/rules/suggestions?window_days=60&min_count=3")
    assert res.status_code == 200, res.text
    payload = res.json()
    suggs = payload["suggestions"]
    assert any(s["merchant"] and s["category"] for s in suggs)

    # Find starbucks suggestion if present
    star = None
    for s in suggs:
        if "starbucks" in s["merchant"].lower():
            star = s
            break

    if star is not None:
        body = {"merchant": star["merchant"], "category": star["category"]}
        r = client.post("/rules/suggestions/apply", json=body)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        assert j["merchant"] == star["merchant"]
        assert j["category"] == star["category"]

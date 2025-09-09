import pytest
from datetime import datetime, timedelta, timezone

from app.models.transaction import Transaction

def _mk_txn(db, merchant="Starbucks", category="Coffee"):
    row = Transaction(
        date=datetime.now(timezone.utc).date(),
        merchant=merchant,
        description=merchant,
        amount=-5.0,
        category=None,
        raw_category=None,
        account="test",
        month="2025-09",
    )
    db.add(row)
    db.flush()
    return row


def test_feedback_accept_triggers_suggestion(client, db_session):
    txn = _mk_txn(db_session)

    # send 3 accepts to cross threshold
    for _ in range(3):
        r = client.post(
            "/ml/feedback",
            json={
                "txn_id": txn.id,
                "merchant": "Starbucks #123",
                "category": "Coffee",
                "action": "accept",
            },
        )
        assert r.status_code == 200

    data = r.json()
    # after threshold, a suggestion_id should be present
    assert data["ok"] is True
    assert "suggestion_id" in data

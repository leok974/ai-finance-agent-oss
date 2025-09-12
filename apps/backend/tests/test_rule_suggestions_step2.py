import pytest
from datetime import datetime, timezone
import uuid

from app.transactions import Transaction


def _mk_txn(db, merchant="Starbucks", category="Coffee"):
    today = datetime.now(timezone.utc).date()
    unique_suffix = uuid.uuid4().hex[:8]
    desc = f"{merchant} test-{unique_suffix}"

    row = Transaction(
        date=today,
        merchant=merchant,
        description=desc,          # unique per test run
        amount=-5.0,
        category=None,
        raw_category=None,
        account="test",
        month=today.strftime("%Y-%m"),
    )
    db.add(row)
    db.flush()
    db.commit()  # visibility across the overridden get_db
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

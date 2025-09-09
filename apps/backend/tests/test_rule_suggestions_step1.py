from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.orm_models import Feedback, Transaction
from app.services.rule_suggestions import (
    canonicalize_merchant,
    compute_metrics,
    evaluate_candidate,
)


def _mk_txn(db, merchant: str, amount: float = -5.0, dt: datetime | None = None, category: str | None = None):
    now = dt or datetime.now(timezone.utc)
    t = Transaction(
        date=now.date(),
        merchant=merchant,
        description=None,
        amount=amount,
        category=category,
        raw_category=None,
        account=None,
        month=now.strftime("%Y-%m"),
    )
    db.add(t)
    db.flush()
    return t


def _mk_fb(db, txn: Transaction, label: str, dt: datetime):
    row = Feedback(
        txn_id=txn.id,
        label=label,
        source="user_change",
        created_at=dt,
        notes=None,
    )
    db.add(row)
    db.flush()
    return row


def test_canonicalize_merchant_basic():
    assert canonicalize_merchant("STARBUCKS #1234!") == "starbucks 1234"
    assert canonicalize_merchant("  Uber* Trip Help ") == "uber trip help"


def test_compute_and_evaluate_candidate_with_thresholds(_SessionLocal):
    now = datetime.now(timezone.utc)
    db = _SessionLocal()
    try:
        # 3 feedback rows for the same merchant and category
        t1 = _mk_txn(db, "Starbucks #1234", dt=now)
        for _ in range(3):
            _mk_fb(db, t1, "Coffee", now - timedelta(days=1))

        # one other merchant (noise)
        t2 = _mk_txn(db, "Chipotle", dt=now)
        _mk_fb(db, t2, "Food", now - timedelta(days=1))

        metrics = compute_metrics(db, "starbucks 1234", "Coffee")
        assert metrics is not None
        accepts, rate, last_seen = metrics
        assert accepts == 3
        assert rate == 1.0
        assert isinstance(last_seen, datetime)

        sugg = evaluate_candidate(db, "starbucks 1234", "Coffee")
        assert sugg is not None
        assert sugg.merchant_norm == "starbucks 1234"
        assert sugg.category == "Coffee"
        assert sugg.support_count == 3
        assert sugg.positive_rate == 1.0
    finally:
        db.close()

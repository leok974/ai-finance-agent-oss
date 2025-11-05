# apps/backend/tests/test_rule_suggestions_window.py
from datetime import datetime, timedelta, timezone
from app.transactions import Transaction
from app.models import Feedback
from app.services.rule_suggestions import (
    evaluate_candidate,
    canonicalize_merchant,
    WINDOW_DAYS,
)


def _mk_txn(db, merchant="TestCo #1", amount=-5.0, day_offset=0):
    dt = datetime.now(timezone.utc) + timedelta(days=day_offset)
    tx = Transaction(
        date=dt.date(),
        merchant=merchant,
        description=merchant,
        amount=amount,
        category=None,
        raw_category=None,
        account="test",
        month=dt.strftime("%Y-%m"),
    )
    db.add(tx)
    db.flush()
    db.refresh(tx)
    return tx


def _add_fb(db, txn_id: int, category="Coffee", source="accept", days_ago=0):
    ts = datetime.now(timezone.utc) - timedelta(days=days_ago)
    fb = Feedback(
        txn_id=txn_id,
        label=category,
        source=source,
        created_at=ts,
    )
    db.add(fb)
    db.flush()
    db.refresh(fb)
    return fb


def test_window_includes_recent_and_excludes_old(db_session):
    # Ensure default window
    assert WINDOW_DAYS == 30

    tx = _mk_txn(db_session, merchant="Cafe Alpha")
    mnorm = canonicalize_merchant(tx.merchant)

    # Inside window: 3 accepts within 2 days
    _add_fb(db_session, tx.id, category="Coffee", source="accept", days_ago=1)
    _add_fb(db_session, tx.id, category="Coffee", source="accept", days_ago=2)
    _add_fb(db_session, tx.id, category="Coffee", source="accept", days_ago=0)

    # Outside window: these should be ignored
    _add_fb(db_session, tx.id, category="Coffee", source="accept", days_ago=45)
    _add_fb(db_session, tx.id, category="Coffee", source="reject", days_ago=60)

    sug = evaluate_candidate(db_session, mnorm, "Coffee")
    assert sug is not None, "Should suggest when recent support meets threshold"
    assert sug.merchant_norm == mnorm
    assert sug.category == "Coffee"


def test_outside_window_only_no_suggestion(db_session):
    tx = _mk_txn(db_session, merchant="Cafe Beta")
    mnorm = canonicalize_merchant(tx.merchant)

    # All outside the window
    for d in (45, 46, 47):
        _add_fb(db_session, tx.id, category="Coffee", source="accept", days_ago=d)

    sug = evaluate_candidate(db_session, mnorm, "Coffee")
    assert sug is None, "Old feedback should not trigger a suggestion"


def test_cutoff_is_inclusive(db_session):
    tx = _mk_txn(db_session, merchant="Cafe Gamma")
    mnorm = canonicalize_merchant(tx.merchant)

    # Exactly at cutoff should count
    _add_fb(db_session, tx.id, category="Coffee", source="accept", days_ago=WINDOW_DAYS)
    _add_fb(db_session, tx.id, category="Coffee", source="accept", days_ago=0)
    _add_fb(db_session, tx.id, category="Coffee", source="accept", days_ago=1)

    sug = evaluate_candidate(db_session, mnorm, "Coffee")
    assert sug is not None

from datetime import datetime, timedelta, timezone

from app.models import Transaction, Feedback, RuleSuggestion
import importlib
import app.services.rule_suggestions as rs


def _txn(db, merchant="Cafe X", amount=-5.00, days_ago=0, category=None):
    d = (datetime.now(timezone.utc) - timedelta(days=days_ago)).date()
    t = Transaction(date=d, merchant=merchant, description="coffee", amount=amount, category=category, raw_category=None, account=None, month=d.strftime("%Y-%m"))
    db.add(t)
    db.flush()
    return t


def _fb(db, txn_id: int, label="Coffee", source="accept", days_ago=0):
    ts = datetime.now(timezone.utc) - timedelta(days=days_ago)
    f = Feedback(txn_id=txn_id, label=label, source=source, created_at=ts)
    db.add(f)
    db.flush()
    return f


def test_reject_dominant_no_suggestion(db_session, monkeypatch):
    # isolate
    db_session.query(Feedback).delete()
    db_session.query(RuleSuggestion).delete()
    db_session.query(Transaction).delete()
    db_session.commit()
    monkeypatch.setenv("RULE_SUGGESTION_WINDOW_DAYS", "30")
    monkeypatch.setenv("RULE_SUGGESTION_MIN_SUPPORT", "3")
    monkeypatch.setenv("RULE_SUGGESTION_MIN_POSITIVE", "0.8")
    importlib.reload(rs)
    t = _txn(db_session)
    _fb(db_session, t.id, source="accept", days_ago=1)
    _fb(db_session, t.id, source="reject", days_ago=1)
    _fb(db_session, t.id, source="reject", days_ago=0)

    mnorm = rs.canonicalize_merchant(t.merchant)
    sugg = rs.evaluate_candidate(db_session, mnorm, "Coffee")
    assert sugg is None


def test_mixed_categories_below_support(db_session, monkeypatch):
    # isolate
    db_session.query(Feedback).delete()
    db_session.query(RuleSuggestion).delete()
    db_session.query(Transaction).delete()
    db_session.commit()
    monkeypatch.setenv("RULE_SUGGESTION_WINDOW_DAYS", "30")
    monkeypatch.setenv("RULE_SUGGESTION_MIN_SUPPORT", "3")
    monkeypatch.setenv("RULE_SUGGESTION_MIN_POSITIVE", "0.8")
    importlib.reload(rs)
    t = _txn(db_session)
    # Two Coffee accepts, two Food accepts: neither reaches support 3
    _fb(db_session, t.id, label="Coffee", source="accept", days_ago=1)
    _fb(db_session, t.id, label="Coffee", source="accept", days_ago=0)
    _fb(db_session, t.id, label="Food", source="accept", days_ago=2)
    _fb(db_session, t.id, label="Food", source="accept", days_ago=0)

    mnorm = rs.canonicalize_merchant(t.merchant)
    # Coffee shouldn't meet support 3
    assert rs.evaluate_candidate(db_session, mnorm, "Coffee") is None
    # Food shouldn't meet support 3
    assert rs.evaluate_candidate(db_session, mnorm, "Food") is None


def test_existing_rule_coverage_todo(db_session, monkeypatch):
    # Placeholder to remind adding rule-coverage check later
    monkeypatch.setenv("RULE_SUGGESTION_WINDOW_DAYS", "30")
    monkeypatch.setenv("RULE_SUGGESTION_MIN_SUPPORT", "3")
    monkeypatch.setenv("RULE_SUGGESTION_MIN_POSITIVE", "0.8")
    importlib.reload(rs)
    t = _txn(db_session)
    _fb(db_session, t.id, label="Coffee", source="accept", days_ago=0)
    mnorm = rs.canonicalize_merchant(t.merchant)
    # Currently no coverage check implemented; ensure function returns either None or a suggestion without error
    _ = rs.evaluate_candidate(db_session, mnorm, "Coffee")
    assert True

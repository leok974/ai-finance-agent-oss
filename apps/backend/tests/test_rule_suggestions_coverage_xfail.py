import pytest
from datetime import datetime, timedelta, timezone
from app.models import Transaction, Feedback, Rule
import app.services.rule_suggestions as rs


@pytest.mark.xfail(
    reason="coverage check not implemented yet; placeholder to prevent regressions when added",
    strict=False,
)
def test_existing_rule_coverage_skips_suggestion(db_session, monkeypatch):
    monkeypatch.setenv("RULE_SUGGESTION_WINDOW_DAYS", "30")
    d = (datetime.now(timezone.utc) - timedelta(days=0)).date()
    t = Transaction(
        date=d,
        merchant="Cafe X",
        description="coffee",
        amount=-5.50,
        category=None,
        raw_category=None,
        account=None,
        month=d.strftime("%Y-%m"),
    )
    db_session.add(t)
    db_session.flush()
    db_session.add(Feedback(txn_id=t.id, label="Coffee", source="accept"))
    db_session.add(
        Rule(
            pattern=rs.canonicalize_merchant("Cafe X"),
            target="merchant",
            category="Coffee",
            active=True,
        )
    )
    db_session.commit()

    mnorm = rs.canonicalize_merchant("Cafe X")
    assert rs.evaluate_candidate(db_session, mnorm, "Coffee") is None

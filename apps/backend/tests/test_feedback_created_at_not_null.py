from __future__ import annotations


def test_feedback_created_at_not_null_default(db_session):
    from app.models import Feedback, Transaction
    from datetime import date as _date
    # create txn without created_at
    t = Transaction(date=_date(2025, 8, 10), amount=-1.0, description="Test", account="x", month="2025-08")
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)

    fb = Feedback(txn_id=t.id, label="Coffee", source="accept")
    db_session.add(fb)
    db_session.commit()
    db_session.refresh(fb)
    assert getattr(fb, "created_at", None) is not None

from datetime import date
from app.models import Transaction


def test_canonical_on_insert(db_session):
    d = date(2025, 8, 10)
    t = Transaction(
        date=d,
        amount=-10.0,
        description="t",
        merchant="  Café—Gamma  ",
        month=d.strftime("%Y-%m"),
    )
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    assert t.merchant_canonical == "cafe gamma"

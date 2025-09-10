import datetime as dt

from app.orm_models import Transaction


def _seed(db, month: str):
    y, m = map(int, month.split("-", 1))
    t1 = Transaction(
        date=dt.date(y, m, 3),
        merchant="Coffee",
        description=f"Latte {month}",
        amount=-5.75,
        category="Dining",
        raw_category=None,
        account="Checking",
        month=month,
    )
    t2 = Transaction(
        date=dt.date(y, m, 5),
        merchant="Employer",
        description=f"Paycheck {month}",
        amount=1000.00,
        category="Income",
        raw_category=None,
        account="Checking",
        month=month,
    )
    db.add_all([t1, t2])
    db.commit()


def test_month_summary_shape(client, db_session):
    _seed(db_session, "2024-04")
    r = client.get("/charts/month_summary?month=2024-04")
    assert r.status_code == 200
    body = r.json()
    for key in ("month", "total_spend", "total_income", "net", "categories"):
        assert key in body


def test_month_merchants_shape(client, db_session):
    _seed(db_session, "2024-05")
    r = client.get("/charts/month_merchants?month=2024-05&limit=5")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, dict)
    rows = body.get("merchants", [])
    assert isinstance(rows, list)
    if rows:
        assert "merchant" in rows[0]
        assert "amount" in rows[0]
        assert rows[0]["amount"] >= 0


def test_month_flows_shape(client, db_session):
    _seed(db_session, "2024-06")
    r = client.get("/charts/month_flows?month=2024-06")
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) >= {"month", "series"}


def test_spending_trends_length(client, db_session):
    _seed(db_session, "2024-07")
    r = client.get("/charts/spending_trends?months=4")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, dict)
    assert "trends" in body or isinstance(body, list)

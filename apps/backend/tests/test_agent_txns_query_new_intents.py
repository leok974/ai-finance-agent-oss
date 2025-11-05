from datetime import date
from app.orm_models import Transaction


def seed_august(db):
    db.query(Transaction).delete()
    db.commit()

    def m(d: date) -> str:
        return f"{d.year:04d}-{d.month:02d}"

    rows = [
        Transaction(
            date=date(2025, 8, 1),
            merchant="Shop A",
            category="Misc",
            amount=-10.00,
            description="A1",
            month=m(date(2025, 8, 1)),
        ),
        Transaction(
            date=date(2025, 8, 7),
            merchant="Shop B",
            category="Misc",
            amount=-20.00,
            description="B1",
            month=m(date(2025, 8, 7)),
        ),
        Transaction(
            date=date(2025, 8, 14),
            merchant="Shop C",
            category="Misc",
            amount=-30.00,
            description="C1",
            month=m(date(2025, 8, 14)),
        ),
        Transaction(
            date=date(2025, 8, 21),
            merchant="Employer",
            category="Income",
            amount=200.00,
            description="Pay",
            month=m(date(2025, 8, 21)),
        ),
    ]
    db.add_all(rows)
    db.commit()


def test_average_in_month(client, db_session):
    db = db_session
    seed_august(db)
    r = client.post("/agent/txns_query", json={"q": "average in August 2025"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "average"
    avg = float(data["result"]["average_abs"])  # abs across all rows
    assert avg > 0


def test_by_week_series_in_month(client, db_session):
    db = db_session
    seed_august(db)
    r = client.post("/agent/txns_query", json={"q": "by week in August 2025"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] in ("by_week", "by_week")
    series = data["result"]
    assert isinstance(series, list) and len(series) >= 1
    total = sum(float(p.get("spend", 0) or 0) for p in series)
    assert total >= 60.0  # three expenses of 10,20,30


def test_sum_since_date(client, db_session):
    db = db_session
    seed_august(db)
    r = client.post("/agent/txns_query", json={"q": "sum since 2025-08-01"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "sum"
    assert float(data["result"]["total_abs"]) >= 60.0

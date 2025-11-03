import datetime as dt
from app.orm_models import Transaction


def _insert_rows(rows, db):
    """Insert helper that uses the provided scoped test session.

    We intentionally accept the db fixture so that we always operate on the
    current engine bound for tests (avoids stale SessionLocal copies imported
    before fixture monkeypatching) and benefit from the per‑test clean slate
    established in the db_session fixture (drop/create all tables).
    """
    for r in rows:
        db.add(Transaction(**r))
    db.commit()


def test_latest_month_from_date(client, db_session):
    # Insert rows with proper date values
    today = dt.date.today()
    rows = [
        {
            "date": today.replace(day=1),
            "merchant": None,
            "description": None,
            "amount": 10.0,
            "category": None,
            "raw_category": None,
            "account": None,
            "month": today.strftime("%Y-%m"),
        },
        {
            "date": today,
            "merchant": None,
            "description": None,
            "amount": 11.0,
            "category": None,
            "raw_category": None,
            "account": None,
            "month": today.strftime("%Y-%m"),
        },
    ]
    _insert_rows(rows, db_session)
    r = client.post("/agent/tools/meta/latest_month", json={})
    assert r.status_code == 200
    m = r.json()["month"]
    assert m == today.strftime("%Y-%m")


def test_latest_month_fallback_month_column(client, db_session):
    # Insert rows with month column only (date still required by schema, set first of month)
    base = dt.date(2024, 12, 1)
    rows = [
        {
            "date": base,
            "merchant": None,
            "description": None,
            "amount": 5.0,
            "category": None,
            "raw_category": None,
            "account": None,
            "month": "2024-12",
        },
        {
            "date": base.replace(month=11),
            "merchant": None,
            "description": None,
            "amount": 6.0,
            "category": None,
            "raw_category": None,
            "account": None,
            "month": "2024-11",
        },
    ]
    _insert_rows(rows, db_session)
    r = client.post("/agent/tools/meta/latest_month", json={})
    assert r.status_code == 200
    assert r.json()["month"] == "2024-12"


# Empty DB case already covered in existing test file; reaffirm here lightweightly


def test_latest_month_empty_db_second_check(client, db_session):
    r = client.post("/agent/tools/meta/latest_month", json={})
    assert r.status_code == 200
    # Fresh DB (db_session fixture drops & recreates tables) -> expect empty response.
    assert r.json()["month"] in (None, "")

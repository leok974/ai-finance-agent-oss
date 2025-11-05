from app.transactions import Transaction


def seed(db):
    from datetime import date

    rows = [
        Transaction(
            date=date(2025, 6, 5),
            amount=2000,
            merchant="ACME",
            category="Salary",
            month="2025-06",
        ),
        Transaction(
            date=date(2025, 6, 6),
            amount=-300,
            merchant="Grocer",
            category="Groceries",
            month="2025-06",
        ),
        Transaction(
            date=date(2025, 7, 7),
            amount=2100,
            merchant="ACME",
            category="Salary",
            month="2025-07",
        ),
        Transaction(
            date=date(2025, 7, 8),
            amount=-400,
            merchant="Grocer",
            category="Groceries",
            month="2025-07",
        ),
    ]
    db.add_all(rows)
    db.commit()


def test_kpis(client, db_session):
    seed(db_session)
    r = client.post("/agent/tools/analytics/kpis", json={})
    assert r.status_code == 200
    j = r.json()
    assert "kpis" in j and "avg_inflows" in j["kpis"]
    assert j["kpis"]["avg_inflows"] >= 0

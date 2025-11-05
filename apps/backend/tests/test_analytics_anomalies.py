from app.transactions import Transaction


def seed(db):
    from datetime import date

    # Build a month with small purchases and one outlier
    rows = [
        Transaction(
            date=date(2025, 8, 1),
            amount=2000,
            merchant="ACME",
            category="Salary",
            month="2025-08",
        )
    ]
    for d in range(2, 10):
        rows.append(
            Transaction(
                date=date(2025, 8, d),
                amount=-20,
                merchant="Coffee",
                category="Dining",
                month="2025-08",
            )
        )
    rows.append(
        Transaction(
            date=date(2025, 8, 15),
            amount=-500,
            merchant="Electronics",
            category="Gadgets",
            month="2025-08",
        )
    )
    db.add_all(rows)
    db.commit()


def test_anomalies(client, db_session):
    seed(db_session)
    r = client.post("/agent/tools/analytics/anomalies", json={"lookback_months": 1})
    assert r.status_code == 200
    j = r.json()
    assert j.get("month")
    assert isinstance(j.get("items"), list)

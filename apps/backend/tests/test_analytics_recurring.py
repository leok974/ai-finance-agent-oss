from app.transactions import Transaction


def seed(db):
    from datetime import date

    rows = [
        Transaction(
            date=date(2025, 6, 5),
            amount=-12,
            merchant="Spotify",
            category="Subscriptions",
            month="2025-06",
        ),
        Transaction(
            date=date(2025, 7, 5),
            amount=-12,
            merchant="Spotify",
            category="Subscriptions",
            month="2025-07",
        ),
        Transaction(
            date=date(2025, 8, 5),
            amount=-12,
            merchant="Spotify",
            category="Subscriptions",
            month="2025-08",
        ),
        Transaction(
            date=date(2025, 8, 10),
            amount=2000,
            merchant="ACME",
            category="Salary",
            month="2025-08",
        ),
    ]
    db.add_all(rows)
    db.commit()


def test_recurring_and_subs(client, db_session):
    seed(db_session)
    r1 = client.post("/agent/tools/analytics/recurring", json={})
    assert r1.status_code == 200
    assert isinstance(r1.json().get("items"), list)

    r2 = client.post("/agent/tools/analytics/subscriptions", json={})
    assert r2.status_code == 200
    assert isinstance(r2.json().get("items"), list)

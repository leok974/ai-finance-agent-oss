from app.transactions import Transaction


def seed(db):
    from datetime import date
    rows = [
        Transaction(date=date(2025,8,1), amount=2500, merchant="ACME", category="Salary", month="2025-08"),
        Transaction(date=date(2025,8,3), amount=-200, merchant="Grocer", category="Groceries", month="2025-08"),
        Transaction(date=date(2025,8,7), amount=-120, merchant="Cafe", category="Dining", month="2025-08"),
    ]
    db.add_all(rows)
    db.commit()


def test_whatif_sim_by_category(client, db_session):
    seed(db_session)
    payload = {
        "month": "2025-08",
        "cuts": [
            {"category": "Dining", "pct": 50}
        ]
    }
    r = client.post("/agent/tools/analytics/whatif", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data.get("month") == "2025-08"
    base = data.get("base", {})
    sim = data.get("sim", {})
    assert base.get("outflows") > sim.get("outflows")


def test_whatif_sim_by_merchant(client, db_session):
    seed(db_session)
    payload = {
        "month": "2025-08",
        "cuts": [
            {"merchant": "Grocer", "pct": 25}
        ]
    }
    r = client.post("/agent/tools/analytics/whatif", json=payload)
    assert r.status_code == 200
    data = r.json()
    base = data.get("base", {})
    sim = data.get("sim", {})
    assert base.get("outflows") > sim.get("outflows")

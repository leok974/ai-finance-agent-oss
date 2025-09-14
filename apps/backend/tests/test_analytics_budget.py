from app.transactions import Transaction

def seed(db):
    from datetime import date
    rows = [
        Transaction(date=date(2025,6,2), amount=-120, merchant="Grocer", category="Groceries", month="2025-06"),
        Transaction(date=date(2025,7,6), amount=-180, merchant="Grocer", category="Groceries", month="2025-07"),
        Transaction(date=date(2025,8,4), amount=-150, merchant="Grocer", category="Groceries", month="2025-08"),
        Transaction(date=date(2025,8,10), amount=-90, merchant="Cafe", category="Dining", month="2025-08"),
        Transaction(date=date(2025,8,15), amount=2500, merchant="ACME", category="Salary", month="2025-08"),
    ]
    db.add_all(rows)
    db.commit()


def test_budget_suggest(client, db_session):
    seed(db_session)
    r = client.post("/agent/tools/analytics/budget/suggest", json={})
    assert r.status_code == 200
    items = r.json().get("items")
    assert isinstance(items, list)
    cats = {x.get("category") for x in items}
    assert "Groceries" in cats
    assert "Dining" in cats

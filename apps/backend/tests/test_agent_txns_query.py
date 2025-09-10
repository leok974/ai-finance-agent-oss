# apps/backend/tests/test_agent_txns_query.py
from datetime import date
from app.orm_models import Transaction
import pytest

def seed(db):
    # ensure idempotent seeding for repeated test runs
    db.query(Transaction).delete()
    db.commit()
    def month_of(d: date) -> str:
        return f"{d.year:04d}-{d.month:02d}"
    rows = [
        Transaction(date=date(2025, 8, 2), merchant="Starbucks", category="Coffee", amount=-5.25, description="Latte", month=month_of(date(2025, 8, 2))),
        Transaction(date=date(2025, 8, 15), merchant="Starbucks", category="Coffee", amount=-8.50, description="Frapp", month=month_of(date(2025, 8, 15))),
        Transaction(date=date(2025, 8, 3), merchant="Whole Foods", category="Groceries", amount=-42.10, description="Groceries", month=month_of(date(2025, 8, 3))),
        Transaction(date=date(2025, 8, 20), merchant="Acme Payroll", category="Income", amount=2500.00, description="Paycheck", month=month_of(date(2025, 8, 20))),
    ]
    db.add_all(rows)
    db.commit()

def test_sum_last_month(client, db_session):
    db = db_session
    seed(db)
    r = client.post("/agent/txns_query", json={"q": "How much did I spend at Starbucks last month?"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "sum"
    assert data["result"]["total_abs"] >= 13.0

def test_top_merchants_range(client, db_session):
    db = db_session
    seed(db)
    r = client.post("/agent/txns_query", json={"q": "top 2 merchants between 2025-08-01 and 2025-08-31"})
    assert r.status_code == 200
    items = r.json()["result"]
    assert len(items) <= 2
    assert any(i["merchant"] for i in items)

def test_list_with_amount_filter(client, db_session):
    db = db_session
    seed(db)
    r = client.post("/agent/txns_query", json={"q": "show groceries over $40 in August 2025"})
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "list"
    assert any(abs(row["amount"]) >= 40 for row in data["result"])

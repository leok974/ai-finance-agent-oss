from datetime import date
from fastapi.testclient import TestClient
from app.main import app
from app.orm_models import Transaction


def seed_basic(db):
    db.query(Transaction).delete()
    db.commit()

    def m(d):
        return f"{d.year:04d}-{d.month:02d}"

    rows = [
        Transaction(
            date=date(2025, 8, 2),
            merchant="Starbucks",
            category="Coffee",
            amount=-5.25,
            description="Latte",
            month=m(date(2025, 8, 2)),
        ),
        Transaction(
            date=date(2025, 8, 15),
            merchant="Starbucks",
            category="Coffee",
            amount=-8.50,
            description="Frapp",
            month=m(date(2025, 8, 15)),
        ),
        Transaction(
            date=date(2025, 8, 3),
            merchant="Whole Foods",
            category="Groceries",
            amount=-42.10,
            description="Groceries",
            month=m(date(2025, 8, 3)),
        ),
        Transaction(
            date=date(2025, 8, 20),
            merchant="Acme Payroll",
            category="Income",
            amount=2500.00,
            description="Paycheck",
            month=m(date(2025, 8, 20)),
        ),
    ]
    db.add_all(rows)
    db.commit()


def test_chat_short_circuits_to_nl_txns(client, db_session):
    seed_basic(db_session)
    c = TestClient(app)
    r = c.post(
        "/agent/chat",
        json={
            "messages": [
                {
                    "role": "user",
                    "content": "How much did I spend at Starbucks in August 2025?",
                }
            ]
        },
    )
    assert r.status_code == 200
    j = r.json()
    assert j.get("mode") == "nl_txns"
    # reply contains deterministic wording
    assert "Total" in j.get("reply", "") or "Transactions" in j.get("reply", "")
    # structured result present
    assert j.get("result", {}).get("intent") in {
        "sum",
        "count",
        "list",
        "average",
        "top_merchants",
        "top_categories",
        "by_day",
        "by_week",
        "by_month",
    }
    # sanity: total spend must be positive non-zero for Starbucks in August
    if j["result"]["intent"] == "sum":
        assert j["result"]["result"]["total_abs"] > 0

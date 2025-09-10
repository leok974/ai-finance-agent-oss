from datetime import date
from typing import List

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.orm_models import Transaction


def seed_basic_expenses(db: Session):
    rows: List[Transaction] = [
        # Groceries: 400, 450, 500
        Transaction(date=date(2025, 6, 5), merchant="Costco", description="", category="Groceries", amount=-400),
        Transaction(date=date(2025, 7, 5), merchant="Trader Joes", description="", category="Groceries", amount=-450),
        Transaction(date=date(2025, 8, 5), merchant="Whole Foods", description="", category="Groceries", amount=-500),
        # Transport: 120, 160, 200
        Transaction(date=date(2025, 6, 10), merchant="Uber", description="", category="Transport", amount=-120),
        Transaction(date=date(2025, 7, 10), merchant="Lyft", description="", category="Transport", amount=-160),
        Transaction(date=date(2025, 8, 10), merchant="Uber", description="", category="Transport", amount=-200),
        # Income (should be excluded)
        Transaction(date=date(2025, 8, 1), merchant="Employer", description="", category="Income", amount=3000),
        # Unknown (excluded)
        Transaction(date=date(2025, 8, 2), merchant="Mystery", description="", category="Unknown", amount=-50),
    ]
    db.add_all(rows)
    db.commit()


@pytest.mark.budget
def test_budget_apply_upsert_and_filters(db_session: Session, client: TestClient):
    seed_basic_expenses(db_session)

    # Sanity: recommendations include both categories
    r = client.get("/budget/recommendations", params={"months": 6})
    assert r.status_code == 200, r.text
    data = r.json()
    cats = {rec["category"] for rec in data["recommendations"]}
    assert {"Groceries", "Transport"}.issubset(cats)

    # Apply using median for all
    r2 = client.post("/budget/apply", json={"strategy": "median", "months": 6})
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body.get("ok") is True
    applied = {item["category"]: item["amount"] for item in body["applied"]}

    # Expect medians: Groceries ~ 450, Transport ~ 160
    assert pytest.approx(450.0, abs=0.01) == applied["Groceries"]
    assert pytest.approx(160.0, abs=0.01) == applied["Transport"]

    # Verify persisted via /budget/list
    r3 = client.get("/budget/list")
    assert r3.status_code == 200
    listing = r3.json()
    assert pytest.approx(450.0, abs=0.01) == listing["Groceries"]
    assert pytest.approx(160.0, abs=0.01) == listing["Transport"]

    # Re-apply p75 only for Transport via include filter; should update Transport to ~180
    r4 = client.post(
        "/budget/apply",
        json={
            "strategy": "p75",
            "categories_include": ["Transport"],
            "months": 6,
        },
    )
    assert r4.status_code == 200, r4.text
    r5 = client.get("/budget/list")
    assert r5.status_code == 200
    listing2 = r5.json()
    assert pytest.approx(450.0, abs=0.01) == listing2["Groceries"], "Groceries unchanged"
    assert pytest.approx(180.0, abs=0.01) == listing2["Transport"], "Transport updated to p75"

    # Apply median_plus_10 excluding Groceries; only Transport should change
    r6 = client.post(
        "/budget/apply",
        json={
            "strategy": "median_plus_10",
            "categories_exclude": ["Groceries"],
            "months": 6,
        },
    )
    assert r6.status_code == 200, r6.text
    listing3 = client.get("/budget/list").json()

    # Groceries remains 450; Transport becomes median*1.10 => 160*1.1 = 176
    assert pytest.approx(450.0, abs=0.01) == listing3["Groceries"]
    assert pytest.approx(176.0, abs=0.02) == listing3["Transport"]

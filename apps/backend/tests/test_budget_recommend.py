# apps/backend/tests/test_budget_recommend.py
from datetime import date
from sqlalchemy.orm import Session

from app.orm_models import Transaction
from app.services.budget_recommend import compute_recommendations

def seed_rows(db: Session):
    # 3 months of Groceries & Transport; amounts negative = expenses
    rows = [
        # Groceries: 400, 450, 500
        Transaction(date=date(2025, 6, 5), category="Groceries", amount=-400),
        Transaction(date=date(2025, 7, 5), category="Groceries", amount=-450),
        Transaction(date=date(2025, 8, 5), category="Groceries", amount=-500),
        # Transport: 120, 160, 200
        Transaction(date=date(2025, 6, 10), category="Transport", amount=-120),
        Transaction(date=date(2025, 7, 10), category="Transport", amount=-160),
        Transaction(date=date(2025, 8, 10), category="Transport", amount=-200),
        # Income (should be excluded)
        Transaction(date=date(2025, 8, 1), category="Salary", amount=3000),
        # Unknown (excluded)
        Transaction(date=date(2025, 8, 2), category="Unknown", amount=-50),
    ]
    db.add_all(rows)
    db.commit()

def test_compute_recommendations_basic(db_session: Session):
    seed_rows(db_session)
    recs = compute_recommendations(db_session, months=6)
    # Expect two categories
    cats = {r["category"] for r in recs}
    assert cats == {"Groceries", "Transport"}
    # Check stats
    groceries = next(r for r in recs if r["category"] == "Groceries")
    # p50 ~ 450, p75 ~ 475, avg ~ 450
    assert 445 <= groceries["median"] <= 455
    assert 470 <= groceries["p75"] <= 485
    assert 445 <= groceries["avg"] <= 455
    assert groceries["sample_size"] == 3

    transport = next(r for r in recs if r["category"] == "Transport")
    # p50 ~ 160, p75 ~ 180, avg ~ 160
    assert 155 <= transport["median"] <= 165
    assert 175 <= transport["p75"] <= 185
    assert 155 <= transport["avg"] <= 165
    assert transport["sample_size"] == 3

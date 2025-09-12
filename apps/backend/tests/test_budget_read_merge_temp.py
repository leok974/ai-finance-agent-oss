from app.orm_models import Budget
from app.utils.state import TEMP_BUDGETS


def test_read_budgets_merge_temp(client, db_session, monkeypatch):
    # Seed DB budgets
    db_session.add(Budget(category="Groceries", amount=450.0))
    db_session.add(Budget(category="Transport", amount=160.0))
    db_session.commit()

    # Fix month so test is stable
    monkeypatch.setattr("app.routers.budget.current_month_key", lambda: "2025-09")

    # Add overlay for current month
    TEMP_BUDGETS[("2025-09", "Groceries")] = 500.0
    TEMP_BUDGETS[("2025-09", "Dining out")] = 200.0  # overlay-only category

    # Merge on
    r = client.get("/budgets/read?merge_temp=true").json()
    items = {it["category"]: it for it in r["items"]}

    # Groceries should reflect overlay
    g = items["Groceries"]
    assert g["base_amount"] == 450.0
    assert g["temp_overlay"] == 500.0
    assert g["effective_amount"] == 500.0
    assert g["source"] == "temp"

    # Transport should be DB
    t = items["Transport"]
    assert t["base_amount"] == 160.0
    assert t["temp_overlay"] is None
    assert t["effective_amount"] == 160.0
    assert t["source"] == "db"

    # Dining out appears via overlay-only
    d = items["Dining out"]
    assert d["base_amount"] is None
    assert d["temp_overlay"] == 200.0
    assert d["effective_amount"] == 200.0
    assert d["source"] == "temp"

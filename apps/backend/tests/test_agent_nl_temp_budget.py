from app.services.agent_tools import route_to_tool


def test_route_temp_budget_sets_overlay(db_session):
    # no txns needed; route uses latest_month_str fallback to current_month_key if none
    resp = route_to_tool(
        "set a temporary budget for Groceries to 500 this month", db_session
    )
    assert resp is not None
    assert resp["mode"] == "budgets.temp"
    assert resp["result"]["category"] == "Groceries"
    assert float(resp["result"]["amount"]) == 500.0
    assert "month" in resp["result"]

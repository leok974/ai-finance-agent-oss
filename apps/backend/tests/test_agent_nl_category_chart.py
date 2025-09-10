from datetime import date
from app.orm_models import Transaction
from app.services.agent_tools import route_to_tool


def seed(db):
    # Two months of groceries
    db.add(Transaction(date=date(2025,8,5), category="Groceries", amount=-200))
    db.add(Transaction(date=date(2025,9,6), category="Groceries", amount=-250))
    db.commit()


def test_route_category_chart(db_session):
    seed(db_session)
    resp = route_to_tool("open category chart for Groceries over last 2 months", db_session)
    assert resp is not None
    assert resp["mode"] == "charts.category"
    assert resp["filters"]["category"] == "Groceries"
    assert resp["filters"]["months"] >= 2
    series = resp["result"]["series"]
    assert isinstance(series, list)
    assert len(series) >= 1

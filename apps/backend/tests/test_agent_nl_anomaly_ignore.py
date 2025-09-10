from datetime import date
from app.orm_models import Transaction
from app.services.agent_tools import route_to_tool


def seed(db):
    db.add(Transaction(date=date(2025,9,6), category="Transport", amount=-120))
    db.commit()


def test_route_anomaly_ignore(db_session):
    seed(db_session)
    resp = route_to_tool("ignore anomalies for Transport", db_session)
    assert resp is not None
    assert resp["mode"] == "insights.anomalies.ignore"
    assert resp["filters"]["category"] == "Transport"
    assert "result" in resp and "ignored" in resp["result"]

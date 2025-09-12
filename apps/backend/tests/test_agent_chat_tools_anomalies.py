from datetime import date
from app.orm_models import Transaction
from app.services.agent_tools import route_to_tool
from app.services.agent_detect import Detector


def seed(db):
    # Prior months median ≈ 400; current spikes to 700
    for (y,m), amt in [((2025,4),-380),((2025,5),-420),((2025,6),-400),((2025,7),-410),((2025,8),-390)]:
        db.add(Transaction(date=date(y,m,5), category="Groceries", amount=amt))
    db.add(Transaction(date=date(2025,9,6), category="Groceries", amount=-700))
    # noise / ignored
    db.add(Transaction(date=date(2025,9,10), category="Salary", amount=3000))
    db.add(Transaction(date=date(2025,9,11), category="Unknown", amount=-80))
    db.commit()


def test_route_anomalies_detects_and_returns_structured(db_session):
    seed(db_session)
    det = Detector()
    # ensure detector hits
    assert det.detect_anomalies("anything unusual this month?")
    resp = route_to_tool("anything unusual this month? show top 3", db_session)
    assert resp["mode"] == "insights.anomalies"
    assert resp["filters"]["months"] >= 3
    assert "result" in resp and "anomalies" in resp["result"]
    assert any(a["category"] == "Groceries" for a in resp["result"]["anomalies"]) 

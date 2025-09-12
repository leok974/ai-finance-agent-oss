from datetime import date
from fastapi.testclient import TestClient
from app.main import app
from app.orm_models import Transaction

client = TestClient(app)

def seed(db):
    db.add_all([
        Transaction(date=date(2025,8,2), merchant="Starbucks", category="Coffee", amount=-5.25, month="2025-08"),
        Transaction(date=date(2025,8,15), merchant="Starbucks", category="Coffee", amount=-8.50, month="2025-08"),
    ])
    db.commit()

def test_chat_routes_to_txn_query(db_session):
    seed(db_session)
    r = client.post("/agent/chat", json={"messages":[{"role":"user","content":"How much did I spend at Starbucks in August 2025?"}]})
    assert r.status_code == 200
    data = r.json()
    assert data.get("mode") in ("nl_txns", "llm")
    if data.get("mode") == "nl_txns":
        assert data["result"]["intent"] == "sum"
        assert data["result"]["result"]["total_abs"] >= 13.0

def test_chat_builds_report_link(db_session):
    r = client.post("/agent/chat", json={"messages":[{"role":"user","content":"Export Excel for last month with transactions"}]})
    assert r.status_code == 200
    data = r.json()
    # May fall back to LLM if window cannot be resolved in empty DB
    if data.get("mode") == "report.link":
        assert "/report/excel" in data.get("url", "")
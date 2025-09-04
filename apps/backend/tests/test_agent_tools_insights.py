import io
import textwrap
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
pytestmark = [pytest.mark.agent_tools, pytest.mark.insights]


def _ingest(csv_text: str):
    files = {"file": ("seed.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
    r = client.post("/ingest", files=files)
    assert r.status_code in (200, 201), r.text


def test_insights_summary_shapes_and_signals():
    month = "2025-08"
    csv = textwrap.dedent(f"""\
        date,month,merchant,description,amount,category
        2025-08-01,{month},Payroll,Monthly salary,5000.00,Income
        2025-08-02,{month},Costco,Groceries,-120.00,
        2025-08-03,{month},Uber,Ride home,-35.50,
        2025-08-04,{month},Amazon,Household,-75.00,
        2025-08-05,{month},Delta,Flight,-400.00,Travel
        2025-08-06,{month},Spotify,Family plan,-15.99,Subscriptions
    """)
    _ingest(csv)

    r = client.post("/agent/tools/insights/summary", json={
        "month": month,
        "top_n": 3,
        "large_txn_threshold": 200.0,
        "include_unknown": True
    })
    assert r.status_code == 200, r.text
    payload = r.json()

    assert payload["month"] == month
    assert "insights" in payload and isinstance(payload["insights"], list)
    kinds = [i["kind"] for i in payload["insights"]]

    # We expect at least the summary, top_* lists, and a large_transaction
    assert "summary" in kinds
    assert "top_categories" in kinds
    assert "top_merchants" in kinds
    assert "large_transaction" in kinds  # Delta -400 triggers this

    # If your ingest leaves categories empty, unknown_spend should appear due to blank categories
    if any(k == "unknown_spend" for k in kinds):
        unk = next(i for i in payload["insights"] if i["kind"] == "unknown_spend")
        assert "unknown_spend" in unk["metrics"] and unk["metrics"]["unknown_spend"] >= 0.0

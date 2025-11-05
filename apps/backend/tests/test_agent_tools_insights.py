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


## Removed deprecated summary test; expanded endpoint supersedes it.


def test_insights_expanded_basic_shape():
    month = "2025-08"
    csv = textwrap.dedent(
        f"""\
        date,month,merchant,description,amount,category
        2025-08-01,{month},Payroll,Monthly salary,5000.00,Income
        2025-08-02,{month},Costco,Groceries,-120.00,
        2025-08-03,{month},Uber,Ride home,-35.50,
        2025-08-04,{month},Amazon,Household,-75.00,
        2025-08-05,{month},Delta,Flight,-400.00,Travel
        2025-08-06,{month},Spotify,Family plan,-15.99,Subscriptions
    """
    )
    _ingest(csv)

    r = client.post(
        "/agent/tools/insights/expanded", json={"month": month, "large_limit": 5}
    )
    assert r.status_code == 200, r.text
    payload = r.json()

    # Basic fields present
    assert payload.get("month") == month
    assert "summary" in payload and isinstance(payload["summary"], dict)
    assert set(payload["summary"].keys()) >= {"income", "spend", "net"}

    # Lists are present and JSON-safe
    assert isinstance(payload.get("top_categories"), list)
    assert isinstance(payload.get("top_merchants"), list)
    assert isinstance(payload.get("large_transactions"), list)

    # Unknown spend shape
    us = payload.get("unknown_spend")
    assert isinstance(us, dict)
    assert set(us.keys()) >= {"count", "amount"}

    # Anomalies structure exists
    an = payload.get("anomalies")
    assert isinstance(an, dict)
    assert "categories" in an and "merchants" in an

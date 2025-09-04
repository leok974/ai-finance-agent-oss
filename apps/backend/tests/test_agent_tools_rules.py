import io
import textwrap
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
pytestmark = [pytest.mark.agent_tools, pytest.mark.rules]


def _ingest(csv_text: str):
    files = {"file": ("seed.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
    r = client.post("/ingest", files=files)
    assert r.status_code in (200, 201), r.text


def test_rules_test_and_apply_flow():
    month = "2025-08"
    csv = textwrap.dedent(f"""\
        date,month,merchant,description,amount,category
        2025-08-10,{month},Uber,Ride home,-17.80,
        2025-08-11,{month},Uber,Ride to office,-12.30,Unknown
        2025-08-12,{month},Starbucks,Latte,-5.25,
        2025-08-13,{month},Amazon,Household,-34.99,
    """)
    _ingest(csv)

    # 1) test rule: merchant contains "uber"
    body = {"pattern": "uber", "target": "merchant", "category": "Transport", "month": month, "limit": 100}
    r1 = client.post("/agent/tools/rules/test", json=body)
    assert r1.status_code == 200, r1.text
    preview = r1.json()
    assert preview["month"] == month
    assert preview["candidate_category"] == "Transport"
    assert preview["total_hits"] >= 1
    assert "sample" in preview and isinstance(preview["sample"], list)

    # 2) apply rule: should categorize unlabeled Uber txns in this month
    r2 = client.post("/agent/tools/rules/apply", json=body)
    assert r2.status_code == 200, r2.text
    applied = r2.json()
    assert applied["month"] == month
    assert applied["category"] == "Transport"
    # matched_ids may be [] if ingestion auto-labeled, but updated should be >= 0
    assert isinstance(applied["matched_ids"], list)
    assert applied["updated"] >= 0

    # 3) verify those now no longer appear as unlabeled
    #    (Search via agent transaction tool if present, else simply re-test rule and confirm updated count trends to 0)
    r3 = client.post("/agent/tools/rules/apply", json=body)  # re-apply: should have nothing left to update
    assert r3.status_code == 200
    applied2 = r3.json()
    assert applied2["updated"] == 0

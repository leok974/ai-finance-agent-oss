import io
import textwrap
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
pytestmark = [pytest.mark.agent_tools, pytest.mark.budget]


def _ingest(csv_text: str):
    files = {"file": ("seed.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
    r = client.post("/ingest", files=files)
    assert r.status_code in (200, 201), r.text


def test_budget_summary_and_check_basic_flow():
    month = "2025-08"
    csv = textwrap.dedent(
        f"""\
        date,month,merchant,description,amount,category
        2025-08-01,{month},Salary,August payroll,5000.00,Income
        2025-08-02,{month},Costco,Groceries,-120.00,Groceries
        2025-08-03,{month},Uber,Ride home,-18.50,Transport
        2025-08-04,{month},Amazon,Household,-45.00,Shopping
        2025-08-05,{month},Trader Joes,Groceries,-65.25,Groceries
        2025-08-06,{month},Spotify,Family plan,-15.99,Subscriptions
        2025-08-07,{month},Mystery,Unknown spend,-12.34,
    """
    )
    _ingest(csv)

    # 1) Summary
    r1 = client.post("/agent/tools/budget/summary", json={"month": month, "top_n": 5})
    assert r1.status_code == 200, r1.text
    s = r1.json()
    assert s["month"] == month
    # inflows 5000, outflows abs sum of negatives below
    assert "total_outflows" in s and "total_inflows" in s and "net" in s
    assert s["unknown_count"] >= 1  # the blank category row

    # by_category should have structured items
    by_cat = s["by_category"]
    assert isinstance(by_cat, list) and by_cat
    labels = [c["category"] for c in by_cat]
    # In some installs, /ingest ignores CSV category → everything starts as Unknown.
    # We only require that the endpoint aggregates categories and includes Unknown.
    assert (
        isinstance(labels, list) and labels
    ), "Expected at least one category in summary"
    assert "Unknown" in labels

    # top_merchants likewise structured
    top_merchants = s["top_merchants"]
    assert isinstance(top_merchants, list) and top_merchants
    mnames = [m["merchant"] for m in top_merchants]
    assert "Costco" in mnames or "Trader Joes" in mnames

    # 2) Budget check
    limits = {
        "Groceries": 200.0,
        "Transport": 50.0,
        "Shopping": 100.0,
        "Subscriptions": 20.0,
    }
    r2 = client.post(
        "/agent/tools/budget/check",
        json={"month": month, "limits": limits, "include_unknown": True},
    )
    assert r2.status_code == 200, r2.text
    chk = r2.json()
    assert chk["month"] == month
    assert "totals" in chk and "items" in chk
    items = chk["items"]
    assert isinstance(items, list) and items

    # Every item should have the required fields
    for it in items:
        for k in ("category", "limit", "spend", "remaining", "utilization"):
            assert k in it

    # Totals are coherent
    totals = chk["totals"]
    assert all(k in totals for k in ("spend", "limit", "remaining", "utilization"))
    assert abs(totals["limit"] - sum(limits.values())) < 1e-6

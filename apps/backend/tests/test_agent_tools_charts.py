import io
import textwrap
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
pytestmark = [pytest.mark.agent_tools, pytest.mark.charts]


def _ingest(csv_text: str):
    files = {"file": ("seed.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
    r = client.post("/ingest", files=files)
    assert r.status_code in (200, 201), r.text


def test_charts_endpoints_shapes_and_basic_values():
    month_a = "2025-07"
    month_b = "2025-08"

    csv = textwrap.dedent(f"""\
        date,month,merchant,description,amount,category
        2025-07-01,{month_a},Payroll,Salary,5000.00,Income
        2025-07-02,{month_a},Costco,Groceries,-120.00,Groceries
        2025-07-03,{month_a},Uber,Ride,-18.00,Transport
        2025-07-04,{month_a},Amazon,HH,-45.00,Shopping

        2025-08-01,{month_b},Payroll,Salary,5100.00,Income
        2025-08-02,{month_b},Costco,Groceries,-140.00,Groceries
        2025-08-03,{month_b},Uber,Ride,-20.00,Transport
        2025-08-04,{month_b},Amazon,HH,-60.00,Shopping
        2025-08-05,{month_b},Trader Joes,Groceries,-30.00,Groceries
    """)
    _ingest(csv)

    # --- summary ---
    r1 = client.post("/agent/tools/charts/summary", json={"month": month_b, "include_daily": True})
    assert r1.status_code == 200, r1.text
    s = r1.json()
    assert s["month"] == month_b
    for key in ("total_inflows", "total_outflows", "net", "daily"):
        assert key in s
    assert isinstance(s["daily"], list)

    # --- merchants ---
    r2 = client.post("/agent/tools/charts/merchants", json={"month": month_b, "top_n": 5})
    assert r2.status_code == 200, r2.text
    m = r2.json()
    assert m["month"] == month_b
    assert "items" in m and isinstance(m["items"], list)
    # we ingested outflows for some merchants, so a couple should show up
    if m["items"]:
        first = m["items"][0]
        assert set(first.keys()) == {"merchant", "spend", "txns"}

    # --- flows ---
    r3 = client.post("/agent/tools/charts/flows", json={"month": month_b, "top_merchants": 5, "top_categories": 5})
    assert r3.status_code == 200, r3.text
    f = r3.json()
    assert f["month"] == month_b
    assert "edges" in f and isinstance(f["edges"], list)
    # edges are simple cat->merchant with amount
    if f["edges"]:
        e0 = f["edges"][0]
        assert set(e0.keys()) == {"source", "target", "amount"}

    # --- trends ---
    r4 = client.post("/agent/tools/charts/spending_trends", json={"months": [month_a, month_b], "order": "asc"})
    assert r4.status_code == 200, r4.text
    t = r4.json()
    assert t["months"] == [month_a, month_b]
    assert "series" in t and isinstance(t["series"], list) and len(t["series"]) == 2
    for pt in t["series"]:
        assert set(pt.keys()) == {"month", "inflow", "outflow", "net"}

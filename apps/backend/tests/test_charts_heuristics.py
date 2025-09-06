# apps/backend/tests/test_charts_heuristics.py
import io
import math
from textwrap import dedent

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app
from app.db import Base, get_db  # we'll override get_db
from app.orm_models import Transaction, Rule, UserLabel  # ensure metadata is loaded


@pytest.fixture()
def client():
    # Use a single shared, thread-safe in-memory SQLite for TestClient threads
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    # Create tables once for the test DB
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    # Override the app's DB dependency
    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:
        yield c

    # Cleanup override
    app.dependency_overrides.pop(get_db, None)


def _ingest_csv(client: TestClient, csv_text: str):
    files = {"file": ("test.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
    r = client.post("/ingest?replace=true", files=files)
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload.get("ok") is True
    assert payload.get("added", 0) >= 1
    return payload


def _almost(a, b, eps=1e-6):
    return abs(float(a) - float(b)) <= eps


def test_income_spend_heuristic_employer_vs_starbucks(client: TestClient):
    # Employer should be classified as income; Starbucks as spend (LIKE-based heuristic)
    csv = dedent("""\
        date,amount,merchant,description,account,category
        2025-08-05,2000.00,Employer,Paycheck,Checking,
        2025-08-06,6.25,Starbucks,Coffee,Visa,
    """)
    _ingest_csv(client, csv)

    r = client.get("/charts/month_summary")
    assert r.status_code == 200, r.text
    ms = r.json()
    assert ms["month"] == "2025-08"
    assert _almost(ms["total_income"], 2000.00)
    assert _almost(ms["total_spend"], 6.25)
    assert _almost(ms["net"], 2000.00 - 6.25)

    r = client.get("/charts/spending_trends?months=6")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["months"] == 6
    latest = data["trends"][-1]  # chronological order
    assert latest["month"] == "2025-08"
    assert _almost(latest["income"], 2000.00)
    assert _almost(latest["spending"], 6.25)
    assert _almost(latest["net"], 2000.00 - 6.25)


def test_month_merchants_defaults_latest(client: TestClient):
    csv = dedent("""\
        date,amount,merchant,description,account,category
        2025-08-02,12.50,Chipotle,Burrito,Visa,
        2025-08-03,8.99,Amazon,USB-C,Visa,
        2025-08-04,47.60,Shell,Gas,Visa,
    """)
    _ingest_csv(client, csv)

    r = client.get("/charts/month_merchants")  # no ?month
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["month"] == "2025-08"
    merchants = body["merchants"]
    assert isinstance(merchants, list)
    names = {m["merchant"] for m in merchants}
    assert {"Chipotle", "Amazon", "Shell"} <= names


def test_month_flows_defaults_latest_and_shape(client: TestClient):
    csv = dedent("""\
        date,amount,merchant,description,account,category
        2025-08-10,15.99,Netflix,Subscription,Visa,
        2025-08-11,23.10,Uber,Ride,Visa,
    """)
    _ingest_csv(client, csv)

    r = client.get("/charts/month_flows")  # no ?month
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["month"] == "2025-08"
    series = body["series"]
    assert isinstance(series, list) and len(series) == 2
    for point in series:
        assert {"date", "in", "out", "net", "merchant"} <= set(point.keys())
        assert point["in"] >= 0.0
        assert point["out"] >= 0.0
        assert math.isclose(point["net"], point["in"] - point["out"], rel_tol=1e-6, abs_tol=1e-6)


def test_income_spend_heuristic_refund_and_reimbursement(client: TestClient):
    csv = """\
date,amount,merchant,description,account,category
2025-08-12,49.99,Amazon,Refund for return,Visa,
2025-08-13,120.00,Acme Corp,Travel reimbursement,Checking,
2025-08-14,15.00,Starbucks,Coffee,Visa,
"""
    _ingest_csv(client, csv)

    r = client.get("/charts/month_summary")
    assert r.status_code == 200, r.text
    ms = r.json()
    # Two income-like merchants (refund + reimbursement) should be classified as income
    assert ms["month"] == "2025-08"
    assert _almost(ms["total_income"], 49.99 + 120.00)
    assert _almost(ms["total_spend"], 15.00)
    assert _almost(ms["net"], (49.99 + 120.00) - 15.00)

    r = client.get("/charts/spending_trends?months=6")
    assert r.status_code == 200
    latest = r.json()["trends"][-1]
    assert latest["month"] == "2025-08"
    assert _almost(latest["income"], 169.99)
    assert _almost(latest["spending"], 15.00)


def test_transfers_not_counted_as_spend(client: TestClient):
    # Two transfers (in/out) and one real expense; spending should only reflect the expense.
    csv = """\
date,amount,merchant,description,account,category
2025-08-20,500.00,Checking,Transfer from savings,Checking,Transfer In
2025-08-21,500.00,Savings,Transfer to checking,Savings,Transfer Out
2025-08-22,42.00,Groceries,Weekly shop,Visa,
"""
    _ingest_csv(client, csv)

    r = client.get("/charts/month_summary")
    assert r.status_code == 200, r.text
    ms = r.json()
    # Key assertion: transfers are NOT spend; only the groceries row is spend.
    assert ms["month"] == "2025-08"
    assert _almost(ms["total_spend"], 42.00)

    # (We don't assert on income here to keep the test compatible
    #  whether you choose to exclude transfers from income or count Transfer In as income.)


def test_month_merchants_spend_positive(client: TestClient):
    # Seed some data
    csv = dedent("""
        date,amount,merchant,description,account,category
        2025-08-02,12.50,Chipotle,Burrito,Visa,
        2025-08-03,8.99,Amazon,USB-C,Visa,
        2025-08-04,47.60,Shell,Gas,Visa,
        2025-08-05,2000.00,Employer,Paycheck,Checking,
    """)
    _ingest_csv(client, csv)

    res = client.get("/charts/month_merchants")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["month"] == "2025-08"
    rows = body["merchants"]
    assert isinstance(rows, list)
    # amount should be positive magnitude for charting
    for r in rows:
        assert "amount" in r and isinstance(r["amount"], (int, float))
        assert r["amount"] >= 0


def test_spending_trends_normalized(client: TestClient):
    res = client.get("/charts/spending_trends?months=6")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, dict)
    rows = body.get("trends", [])
    assert isinstance(rows, list)
    for r in rows:
        assert all(k in r for k in ("income", "spending", "net"))
        assert all(isinstance(r[k], (int, float)) for k in ("income", "spending", "net"))
        # spending is positive magnitude; net = income - spending
        assert r["spending"] >= 0
        assert abs(r["net"] - (r["income"] - r["spending"])) < 1e-6

import os
from typing import List, Dict, Any
from fastapi.testclient import TestClient

# Import the running app
from app.main import app  # noqa


def _set_txns(items: List[Dict[str, Any]]):
    """Helper to overwrite in-memory txns safely."""
    app.state.txns = list(items)


def test_month_summary_empty_returns_400_or_null_month():
    """
    Contract: When there are no transactions loaded,
      /charts/month_summary MUST either:
        - return 400 {"detail":"No transactions loaded"}
        - OR return 200 {"month": null, totals all 0}
    so the frontend can show onboarding instead of crashing.
    """
    # Save & clear
    original_txns = getattr(app.state, "txns", [])
    _set_txns([])
    # Ensure persistence/state reload mechanisms stay disabled during this test
    os.environ["DISABLE_STATE_PERSIST"] = "1"

    try:
        client = TestClient(app)
        # Reassert empty just before call in case other tests mutated global state
        _set_txns([])
        r = client.get("/charts/month_summary")
        if r.status_code == 400:
            data = r.json()
            assert data.get("detail") and "No transactions" in data["detail"]
        else:
            # Strict empty payload contract: month must be null-ish and totals all zero
            assert r.status_code == 200
            data = r.json()
            assert data.get("month") in (None, "", "null")
            assert data.get("total_spend") in (0, 0.0)
            assert data.get("total_income") in (0, 0.0)
            assert data.get("net") in (0, 0.0)
            cats = data.get("categories", [])
            assert isinstance(cats, list)
            if cats:  # if any categories leaked in, they must have zero amounts
                assert all(isinstance(c, dict) and float(c.get("amount", 0) or 0) == 0 for c in cats)
    finally:
        # Restore
        _set_txns(original_txns)


def test_month_summary_with_data_defaults_to_latest_month_and_computes_totals():
    """
    Contract: With transactions present and no `month` query,
    endpoint defaults to the latest YYYY-MM and computes totals.
    """
    original_txns = getattr(app.state, "txns", [])
    # Craft deterministic dataset spanning two future months unlikely to clash with any
    # background sample data that may be injected (e.g., current real month).
    sample = [
        # Older (first) month
        {"id": 1, "date": "2099-10-30", "amount": 100.00, "merchant": "ACME", "description": "Rebate", "category": "Income"},
        # Latest month (expected)
        {"id": 2, "date": "2099-11-02", "amount": 82.45, "merchant": "Stripe", "description": "Payout", "category": "Income"},
        {"id": 3, "date": "2099-11-05", "amount": -30.00, "merchant": "Grocer", "description": "Food", "category": "Groceries"},
        {"id": 4, "date": "2099-11-07", "amount": -12.50, "merchant": "Chipotle", "description": "Burrito", "category": "Dining"},
    ]
    _set_txns(sample)
    os.environ["DISABLE_STATE_PERSIST"] = "1"

    try:
        # Replace any extraneous txns (race with background loaders) strictly with our sample
        # Overwrite immediately before issuing request to avoid interference
        app.state.txns = list(sample)
        client = TestClient(app)
        r = client.get("/charts/month_summary")
        assert r.status_code == 200
        data = r.json()

        # Should choose latest month automatically
        assert data["month"] == "2099-11", (
            f"Expected latest month 2099-11 from sample; got {data['month']} "
            f"with txns={app.state.txns}"
        )

        # Totals: expenses are negative numbers summed by abs()
        # income = 82.45 ; spend = 30 + 12.5 = 42.5 ; net = 82.45 - 42.5 = 39.95
        assert round(float(data["total_income"]), 2) == 82.45
        assert round(float(data["total_spend"]), 2) == 42.5
        assert round(float(data["net"]), 2) == round(82.45 - 42.5, 2)

        # Categories should include Groceries & Dining with amounts
        cats = {c["name"]: c["amount"] for c in data.get("categories", [])}
        assert round(cats.get("Groceries", 0.0), 2) == 30.0
        assert round(cats.get("Dining", 0.0), 2) == 12.5
    finally:
        _set_txns(original_txns)


def test_month_summary_no_leakage_after_clearing_txns():
    """After previously having non-zero data, clearing in-memory txns must yield zero/null summary.

    Regression guard: ensures aggregation results aren't cached across calls.
    """
    original_txns = getattr(app.state, "txns", [])
    os.environ["DISABLE_STATE_PERSIST"] = "1"
    try:
        # First populate with spending/income
        populated = [
            {"id": 10, "date": "2099-12-01", "amount": 500.0, "merchant": "Stripe", "category": "Income"},
            {"id": 11, "date": "2099-12-03", "amount": -42.0, "merchant": "Market", "category": "Groceries"},
        ]
        _set_txns(populated)
        client = TestClient(app)
        r1 = client.get("/charts/month_summary")
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1.get("month") == "2099-12"
        assert d1.get("total_income") == 500.0
        assert d1.get("total_spend") == 42.0

        # Now clear and call again
        _set_txns([])
        r2 = client.get("/charts/month_summary")
        if r2.status_code == 400:
            jd2 = r2.json()
            assert "No transactions" in jd2.get("detail", "")
        else:
            assert r2.status_code == 200
            d2 = r2.json()
            assert d2.get("month") in (None, "", "null")
            assert d2.get("total_income") in (0, 0.0)
            assert d2.get("total_spend") in (0, 0.0)
            assert d2.get("net") in (0, 0.0)
    finally:
        _set_txns(original_txns)

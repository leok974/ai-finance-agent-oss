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

    try:
        client = TestClient(app)
        r = client.get("/charts/month_summary")
        if r.status_code == 400:
            data = r.json()
            assert "detail" in data
            assert "No transactions loaded" in data["detail"]
        else:
            # Allow an alternative "empty payload" behavior
            assert r.status_code == 200
            data = r.json()
            assert data.get("month") in (None, "", "null")
            assert data.get("total_spend", 0) == 0
            assert data.get("total_income", 0) == 0
            assert data.get("net", 0) == 0
            # categories should be list (possibly empty)
            assert isinstance(data.get("categories", []), list)
    finally:
        # Restore
        _set_txns(original_txns)


def test_month_summary_with_data_defaults_to_latest_month_and_computes_totals():
    """
    Contract: With transactions present and no `month` query,
    endpoint defaults to the latest YYYY-MM and computes totals.
    """
    original_txns = getattr(app.state, "txns", [])
    # Craft small dataset spanning two months
    sample = [
        # Older month
        {"id": 1, "date": "2025-07-30", "amount": 100.00, "merchant": "ACME", "description": "Rebate", "category": "Income"},
        # Latest month
        {"id": 2, "date": "2025-08-02", "amount": 82.45, "merchant": "Stripe", "description": "Payout", "category": "Income"},
        {"id": 3, "date": "2025-08-05", "amount": -30.00, "merchant": "Grocer", "description": "Food", "category": "Groceries"},
        {"id": 4, "date": "2025-08-07", "amount": -12.50, "merchant": "Chipotle", "description": "Burrito", "category": "Dining"},
    ]
    _set_txns(sample)

    try:
        client = TestClient(app)
        r = client.get("/charts/month_summary")
        assert r.status_code == 200
        data = r.json()

        # Should choose latest month automatically
        assert data["month"] == "2025-08"

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

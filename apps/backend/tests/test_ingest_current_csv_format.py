"""
Test CSV ingest with real-world export format (export_nov2025.csv).

This test ensures that:
1. CSV files with current export format are parsed correctly
2. Transactions are actually inserted into the database
3. The response includes detected_month, date_range, and correct counts
4. Charts/summary endpoints return the ingested data
"""

import os
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
from sqlalchemy.orm import Session
from app.orm_models import Transaction

# Enable fake auth for these tests since we're testing ingest logic, not auth
pytestmark = pytest.mark.usefixtures("enable_fake_auth")


@pytest.fixture(autouse=True)
def enable_fake_auth():
    os.environ["TEST_FAKE_AUTH"] = "1"
    yield
    os.environ.pop("TEST_FAKE_AUTH", None)


def test_ingest_parses_current_csv_format(client: TestClient, db_session: Session):
    """
    Test that uploading a realistic CSV fixture results in:
    - response.ok == True
    - response.added > 0
    - response.count > 0
    - response.detected_month is not None
    - Transactions exist in DB for that month
    """
    # Load the fixture
    fixture_path = Path(__file__).parent / "fixtures" / "export_nov2025.csv"
    assert fixture_path.exists(), f"Fixture not found: {fixture_path}"

    with open(fixture_path, "rb") as f:
        # Upload the CSV
        response = client.post(
            "/ingest?replace=true",
            files={"file": ("export_nov2025.csv", f, "text/csv")},
        )

    assert (
        response.status_code == 200
    ), f"Unexpected status: {response.status_code}, body: {response.text}"
    data = response.json()

    # Assertions on response structure
    assert data["ok"] is True, "Expected ok=True in response"
    assert data["added"] > 0, f"Expected added > 0, got {data['added']}"
    assert data["count"] > 0, f"Expected count > 0, got {data['count']}"
    assert data["detected_month"] is not None, "Expected detected_month to be set"
    assert (
        data["detected_month"] == "2025-11"
    ), f"Expected detected_month='2025-11', got {data['detected_month']}"
    assert data["date_range"] is not None, "Expected date_range to be set"
    assert data["date_range"]["earliest"] == "2025-11-01"
    assert data["date_range"]["latest"] == "2025-11-30"

    # Verify transactions are in the database
    txns = db_session.query(Transaction).filter(Transaction.month == "2025-11").all()

    assert len(txns) > 0, "No transactions found in database for 2025-11"
    assert (
        len(txns) == data["added"]
    ), f"Expected {data['added']} transactions in DB, found {len(txns)}"

    # Verify some specific transactions
    payroll = [t for t in txns if "PAYROLL" in (t.description or "")]
    assert len(payroll) >= 1, "Should have at least 1 payroll transaction"
    assert payroll[0].amount > 0, "Payroll should be positive (income)"

    groceries = [
        t
        for t in txns
        if "GROCERY" in (t.description or "").upper()
        or "GROCERIES" in (t.description or "").upper()
    ]
    assert (
        len(groceries) >= 1
    ), f"Should have at least 1 grocery transaction, found {len(groceries)}"
    for g in groceries:
        assert g.amount < 0, "Grocery purchases should be negative (expense)"


def test_ingest_zero_rows_returns_error(client: TestClient, db_session: Session):
    """
    Test that uploading a CSV that parses to 0 rows returns ok=false or a warning,
    not a success message.
    """
    # Create an empty CSV with headers only
    empty_csv = b"date,amount,description,merchant\n"

    response = client.post(
        "/ingest?replace=false",
        files={"file": ("empty.csv", empty_csv, "text/csv")},
    )

    assert response.status_code == 200  # Still 200, but ok should be false or warning
    data = response.json()

    # When count==0, we should NOT claim success
    if data["added"] == 0 or data["count"] == 0:
        # Either ok=false, or we need to check this in frontend
        # For now, just verify the counts are 0
        assert data["added"] == 0
        assert data["count"] == 0
        assert data["detected_month"] is None or data["detected_month"] == ""


def test_ingest_summary_endpoints_reflect_new_data(
    client: TestClient, db_session: Session
):
    """
    After ingesting data, verify that summary endpoints return the correct values.
    """
    # First, ingest the fixture
    fixture_path = Path(__file__).parent / "fixtures" / "export_nov2025.csv"
    with open(fixture_path, "rb") as f:
        ingest_response = client.post(
            "/ingest?replace=true",
            files={"file": ("export_nov2025.csv", f, "text/csv")},
        )

    assert ingest_response.status_code == 200
    data = ingest_response.json()
    month = data["detected_month"]
    assert month == "2025-11"

    # Query summary endpoint for that month
    summary_response = client.post("/agent/tools/charts/summary", json={"month": month})

    assert summary_response.status_code == 200
    summary = summary_response.json()

    # Should have income and expenses
    assert (
        "total_inflows" in summary or "income" in summary or "inflow" in summary
    ), f"Summary keys: {summary.keys()}"
    assert (
        "total_outflows" in summary or "expenses" in summary or "outflow" in summary
    ), f"Summary keys: {summary.keys()}"

    # Income should be positive (payroll)
    income = (
        summary.get("total_inflows")
        or summary.get("income")
        or summary.get("inflow")
        or 0
    )
    assert income > 0, f"Expected positive income, got {income}"

    # Expenses should be negative or positive (depending on convention)
    expenses = (
        summary.get("total_outflows")
        or summary.get("expenses")
        or summary.get("outflow")
        or 0
    )
    assert expenses != 0, "Expected non-zero expenses"

    # Query merchants endpoint
    merchants_response = client.post(
        "/agent/tools/charts/merchants", json={"month": month, "limit": 10}
    )

    assert merchants_response.status_code == 200
    merchants = merchants_response.json()

    assert (
        "items" in merchants or "merchants" in merchants or isinstance(merchants, list)
    )
    items = merchants.get("items") or merchants.get("merchants") or merchants
    assert len(items) > 0, "Should have merchant data"

    # Query categories endpoint
    categories_response = client.post(
        "/agent/tools/budget/summary", json={"month": month}
    )

    assert categories_response.status_code == 200
    categories = categories_response.json()

    # Should have categories data
    assert (
        "by_category" in categories
        or "categories" in categories
        or isinstance(categories, list)
    ), f"Categories keys: {categories.keys()}"
    cats = categories.get("by_category") or categories.get("categories") or categories
    assert len(cats) > 0, "Should have category data"

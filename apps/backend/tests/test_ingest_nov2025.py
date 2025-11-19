"""
Test CSV ingest with realistic November 2025 export format.

Reproduces production ingest flow to verify:
- CSV parsing handles current format
- Transactions are inserted with correct month
- Response includes added > 0 and detected_month

NOTE: All tests in this file use fake auth (TEST_FAKE_AUTH=1) via the
fake_auth_env fixture. This allows us to focus on CSV parsing and DB writes
without dealing with cookie/session mechanics. Auth flows are tested separately.
"""
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.transactions import Transaction

# Apply fake_auth_env fixture to all tests in this file
pytestmark = pytest.mark.usefixtures("fake_auth_env")


@pytest.fixture
def nov2025_csv():
    """Realistic November 2025 CSV fixture."""
    return Path(__file__).parent / "fixtures" / "export_nov2025.csv"


def test_ingest_nov2025_export(client: TestClient, db_session: Session, nov2025_csv: Path):
    """
    Test ingest with realistic November 2025 export.
    
    This test uses prod-like assertions to verify the EXACT contract
    that production should honor. Any deviation between test behavior
    and prod behavior indicates env/auth/infra issues (not CSV parsing).
    
    Verifies:
    - CSV is parsed successfully
    - Transactions are added (added > 0)
    - Month is detected as 2025-11
    - Date range is captured correctly
    - DB actually contains the transactions
    - All transactions have month field populated
    """
    assert nov2025_csv.exists(), f"CSV fixture not found: {nov2025_csv}"
    
    with nov2025_csv.open("rb") as f:
        resp = client.post(
            "/ingest?replace=true",
            files={"file": ("export_nov2025.csv", f, "text/csv")},
        )
    
    # ===== PROD-LIKE CONTRACT ASSERTIONS =====
    # These are the EXACT expectations prod should meet
    
    # 1. HTTP 200 OK (not 401, 500, etc.)
    assert resp.status_code == 200, f"Ingest failed: {resp.status_code} {resp.text}"
    
    data = resp.json()
    
    # 2. Response structure (ok: true, added > 0, count == added)
    assert data["ok"] is True, f"Response ok=False (prod would show this in UI): {data}"
    assert data["added"] > 0, f"No transactions added (prod would show added: 0): {data}"
    assert data["count"] == data["added"], f"count != added (contract violation): {data}"
    
    # 3. Month detection (critical for dashboard queries)
    assert data["detected_month"] == "2025-11", (
        f"Wrong month detected: {data.get('detected_month')} "
        f"(prod dashboard would query wrong month)"
    )
    
    # 4. Date range validation (start <= end)
    assert data["date_range"] is not None, "Date range missing from response"
    date_range = data["date_range"]
    assert date_range["earliest"] is not None, "earliest date is null"
    assert date_range["latest"] is not None, "latest date is null"
    assert date_range["earliest"] <= date_range["latest"], (
        f"Date range invalid: {date_range['earliest']} > {date_range['latest']}"
    )
    
    # For this specific fixture, verify expected date range
    assert date_range["earliest"] == "2025-11-01", (
        f"Wrong earliest date: {date_range['earliest']} (expected 2025-11-01)"
    )
    assert date_range["latest"].startswith("2025-11-"), (
        f"Latest date not in Nov 2025: {date_range['latest']}"
    )
    
    # 5. DB verification: transactions were ACTUALLY inserted
    txn_count = db_session.query(Transaction).count()
    assert txn_count == data["added"], (
        f"DB has {txn_count} txns but response said added={data['added']} "
        f"(in prod this would cause dashboard to show no data)"
    )
    
    # 6. Month field populated (required for dashboard month filtering)
    txns_with_month = db_session.query(Transaction).filter(
        Transaction.month == "2025-11"
    ).count()
    assert txns_with_month == txn_count, (
        f"Only {txns_with_month}/{txn_count} txns have month='2025-11' "
        f"(dashboard queries would return empty results)"
    )
    
    # 7. Sample transaction validation (ensure parsing worked correctly)
    sample_txn = db_session.query(Transaction).first()
    assert sample_txn is not None, "No transactions in DB despite added > 0"
    assert sample_txn.date is not None, "Transaction missing date field"
    assert sample_txn.amount != 0, "Transaction has zero amount"
    assert sample_txn.description, "Transaction missing description"
    assert sample_txn.month == "2025-11", f"Transaction has wrong month: {sample_txn.month}"


def test_ingest_empty_csv_returns_error(client: TestClient):
    """Test that empty CSV returns ok:false with error message."""
    empty_csv = b"date,amount,description,merchant\n"
    
    resp = client.post(
        "/ingest?replace=false",
        files={"file": ("empty.csv", empty_csv, "text/csv")},
    )
    
    assert resp.status_code == 200, "Empty CSV should return 200 with ok:false"
    
    data = resp.json()
    assert data["ok"] is False, "Empty CSV should return ok:false"
    assert data["added"] == 0, "Empty CSV should have added:0"
    assert "error" in data, "Should include error field"
    assert data["error"] in ["empty_file", "no_rows_parsed"], f"Unexpected error: {data['error']}"


def test_ingest_malformed_csv_returns_error(client: TestClient):
    """Test that CSV with wrong columns returns ok:false."""
    bad_csv = b"when,amt,shop,note\n2025-11-01,50,Store,Stuff\n"
    
    resp = client.post(
        "/ingest?replace=false",
        files={"file": ("bad.csv", bad_csv, "text/csv")},
    )
    
    # Should succeed (200) but return ok:false since no valid rows parsed
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    data = resp.json()
    # File had 1 row but no valid transactions (missing required columns)
    assert data["ok"] is False, "Malformed CSV should return ok:false"
    assert data["added"] == 0, "Malformed CSV should have added:0"
    assert "error" in data, "Should include error field"


def test_ingest_duplicate_transactions_not_added(client: TestClient, db_session: Session, nov2025_csv: Path):
    """Test that duplicate transactions are skipped."""
    # Upload once
    with nov2025_csv.open("rb") as f:
        resp1 = client.post(
            "/ingest?replace=false",
            files={"file": ("export_nov2025.csv", f, "text/csv")},
        )
    
    assert resp1.status_code == 200
    data1 = resp1.json()
    first_added = data1["added"]
    assert first_added > 0, "First upload should add transactions"
    
    # Upload same file again (no replace)
    with nov2025_csv.open("rb") as f:
        resp2 = client.post(
            "/ingest?replace=false",
            files={"file": ("export_nov2025.csv", f, "text/csv")},
        )
    
    assert resp2.status_code == 200
    data2 = resp2.json()
    
    # Second upload should add 0 (all duplicates)
    assert data2["added"] == 0, f"Duplicates should not be added: {data2}"
    
    # DB should still have same count as first upload
    txn_count = db_session.query(Transaction).count()
    assert txn_count == first_added, f"DB should have {first_added} txns, got {txn_count}"


def test_ingest_replace_deletes_existing(client: TestClient, db_session: Session, nov2025_csv: Path):
    """Test that replace=true deletes existing transactions."""
    # Upload once
    with nov2025_csv.open("rb") as f:
        resp1 = client.post(
            "/ingest?replace=false",
            files={"file": ("export_nov2025.csv", f, "text/csv")},
        )
    
    assert resp1.status_code == 200
    data1 = resp1.json()
    first_count = db_session.query(Transaction).count()
    assert first_count == data1["added"], "First upload should add transactions"
    
    # Upload again with replace=true
    with nov2025_csv.open("rb") as f:
        resp2 = client.post(
            "/ingest?replace=true",
            files={"file": ("export_nov2025.csv", f, "text/csv")},
        )
    
    assert resp2.status_code == 200
    data2 = resp2.json()
    
    # Second upload should add same count (old deleted, new added)
    assert data2["added"] == data1["added"], f"Replace should add same count: {data2}"
    
    # DB should still have same count
    final_count = db_session.query(Transaction).count()
    assert final_count == data1["added"], f"Replace should result in {data1['added']} txns, got {final_count}"

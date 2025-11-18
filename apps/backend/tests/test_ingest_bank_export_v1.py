"""
Test bank export v1 CSV format ingestion.

This ensures the exact format from export_20251112.csv is always accepted:
Header: Date,Description,Comments,Check Number,Amount,Balance
"""

from pathlib import Path
import pytest

pytestmark = pytest.mark.usefixtures("fake_auth_env")

DATA_DIR = Path(__file__).parent / "data"


def test_ingest_bank_export_v1_format_detection(client, user_override, db_session):
    """Test that bank export v1 format is correctly detected and parsed."""
    user_override.use(user_id=1, is_admin=False)

    csv_path = DATA_DIR / "export_20251112.csv"
    assert csv_path.exists(), f"Test data file not found: {csv_path}"

    with csv_path.open("rb") as f:
        resp = client.post(
            "/ingest",
            files={"file": ("export_20251112.csv", f, "text/csv")},
        )

    assert resp.status_code == 200, f"Ingest failed: {resp.text}"
    body = resp.json()

    # Verify successful ingest
    assert body["ok"] is True, f"Expected ok=True, got {body}"
    assert body["added"] > 0, f"Expected added > 0, got {body['added']}"
    assert (
        body["count"] == body["added"]
    ), f"Expected count == added, got count={body['count']}, added={body['added']}"
    assert (
        body["detected_month"] == "2025-11"
    ), f"Expected detected_month=2025-11, got {body['detected_month']}"

    # Verify format was detected correctly (check logs or response metadata if available)
    # The backend should log: csv_format=bank_v1


def test_ingest_bank_export_v1_pending_detection(client, user_override, db_session):
    """Test that pending transactions are correctly identified."""
    user_override.use(user_id=1, is_admin=False)

    csv_path = DATA_DIR / "export_20251112.csv"

    with csv_path.open("rb") as f:
        resp = client.post(
            "/ingest",
            files={"file": ("export_20251112.csv", f, "text/csv")},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True

    # Query transactions to verify pending flag
    from app.orm_models import Transaction

    txns = db_session.query(Transaction).filter(Transaction.user_id == 1).all()

    # Should have at least one pending transaction (the "Processing..." one)
    pending_txns = [t for t in txns if t.pending]
    assert len(pending_txns) > 0, "Expected at least one pending transaction"

    # Check specific pending transaction
    target_pending = [t for t in txns if "TARGET" in (t.merchant or "").upper()]
    assert len(target_pending) == 1, "Expected exactly one TARGET transaction"
    assert target_pending[0].pending is True, "TARGET transaction should be pending"


def test_ingest_bank_export_v1_amount_parsing(client, user_override, db_session):
    """Test that amounts are correctly parsed from bank format."""
    user_override.use(user_id=1, is_admin=False)

    csv_path = DATA_DIR / "export_20251112.csv"

    with csv_path.open("rb") as f:
        resp = client.post(
            "/ingest",
            files={"file": ("export_20251112.csv", f, "text/csv")},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True

    from app.orm_models import Transaction

    txns = db_session.query(Transaction).filter(Transaction.user_id == 1).all()

    # Verify specific amounts
    starbucks = [t for t in txns if "STARBUCKS" in (t.merchant or "").upper()]
    assert len(starbucks) == 1
    assert starbucks[0].amount == -4.75, f"Expected -4.75, got {starbucks[0].amount}"

    # Verify thousands separator parsing
    payroll = [t for t in txns if "PAYROLL" in (t.description or "").upper()]
    assert len(payroll) == 1
    assert payroll[0].amount == 3628.37, f"Expected 3628.37, got {payroll[0].amount}"


def test_ingest_bank_export_v1_merchant_extraction(client, user_override, db_session):
    """Test that merchants are correctly extracted from bank descriptions."""
    user_override.use(user_id=1, is_admin=False)

    csv_path = DATA_DIR / "export_20251112.csv"

    with csv_path.open("rb") as f:
        resp = client.post(
            "/ingest",
            files={"file": ("export_20251112.csv", f, "text/csv")},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True

    from app.orm_models import Transaction

    txns = db_session.query(Transaction).filter(Transaction.user_id == 1).all()

    # Verify merchants are extracted correctly (without "Point Of Sale Withdrawal" prefix)
    walmart = [t for t in txns if "WALMART" in (t.merchant or "").upper()]
    assert len(walmart) == 1
    merchant = walmart[0].merchant
    assert (
        "Point Of Sale" not in merchant
    ), f"Merchant should not contain 'Point Of Sale': {merchant}"
    assert "WALMART" in merchant.upper(), f"Merchant should contain WALMART: {merchant}"


def test_ingest_bank_export_v1_deduplication(client, user_override, db_session):
    """Test that duplicate transactions are not re-added."""
    user_override.use(user_id=1, is_admin=False)

    csv_path = DATA_DIR / "export_20251112.csv"

    # First ingest
    with csv_path.open("rb") as f:
        resp1 = client.post(
            "/ingest",
            files={"file": ("export_20251112.csv", f, "text/csv")},
        )

    assert resp1.status_code == 200
    body1 = resp1.json()
    assert body1["ok"] is True
    added_first = body1["added"]

    # Second ingest (should detect duplicates)
    with csv_path.open("rb") as f:
        resp2 = client.post(
            "/ingest",
            files={"file": ("export_20251112.csv", f, "text/csv")},
        )

    assert resp2.status_code == 200
    body2 = resp2.json()

    # When all rows are duplicates, the API returns ok=False with error="no_rows_parsed"
    # This is expected behavior - no new transactions were added
    assert body2["ok"] is False, f"Expected ok=False when all duplicates, got {body2}"
    assert (
        body2.get("error") == "no_rows_parsed"
    ), f"Expected error=no_rows_parsed, got {body2.get('error')}"
    assert (
        body2["added"] == 0
    ), f"Expected 0 new transactions on re-ingest, got {body2['added']}"

    # Verify total count in DB
    from app.orm_models import Transaction

    total = db_session.query(Transaction).filter(Transaction.user_id == 1).count()
    assert (
        total == added_first
    ), f"Expected {added_first} total transactions, got {total}"

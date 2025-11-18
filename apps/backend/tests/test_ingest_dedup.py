"""
Test CSV ingest deduplication and replace mode behavior.

This ensures:
1. Duplicate transactions are skipped gracefully (no 500 error)
2. Mixed files (new + duplicates) only add new transactions
3. Replace mode wipes covered months before importing
"""

from pathlib import Path
from datetime import date
from decimal import Decimal
import pytest
from app.transactions import Transaction

pytestmark = pytest.mark.usefixtures("fake_auth_env")

DATA_DIR = Path(__file__).parent / "data"


def test_ingest_all_duplicates_returns_helpful_message(
    client, user_override, db_session
):
    """When all rows in CSV already exist, should return helpful error (not 500)."""
    user_override.use(user_id=1, is_admin=False)

    # Seed DB with transaction matching a row from the CSV
    txn = Transaction(
        user_id=1,
        date=date(2025, 10, 13),
        amount=Decimal("-14.20"),
        description="Point Of Sale Withdrawal CLOUDFLARE CLOUDFLARE.CO CA US",
        merchant="CLOUDFLARE CLOUDFLARE.CO CA",
        month="2025-10",
        pending=False,
    )
    db_session.add(txn)
    db_session.commit()

    # Upload CSV containing only this one transaction
    csv_content = b"""Date,Description,Comments,Check Number,Amount,Balance
10/13/2025,Point Of Sale Withdrawal CLOUDFLARE CLOUDFLARE.CO CA US,,,($14.20),$3628.37"""

    resp = client.post(
        "/ingest",
        files={"file": ("duplicates.csv", csv_content, "text/csv")},
    )

    # Should NOT return 500
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    body = resp.json()

    # Should indicate error with helpful message
    assert body["ok"] is False, f"Expected ok=False for all duplicates, got {body}"
    assert (
        body["error"] == "all_rows_duplicate"
    ), f"Expected error=all_rows_duplicate, got {body.get('error')}"
    assert body["added"] == 0, f"Expected added=0, got {body['added']}"
    assert (
        body["duplicates"] >= 1
    ), f"Expected duplicates >= 1, got {body.get('duplicates', 0)}"
    assert (
        "already exist" in body["message"].lower()
    ), f"Expected helpful message, got: {body['message']}"


def test_ingest_mixed_new_and_duplicates_skips_duplicates(
    client, user_override, db_session
):
    """CSV with mix of new and existing transactions should only add new ones."""
    user_override.use(user_id=1, is_admin=False)

    # Seed one existing transaction (APPLE.COM from 11/12)
    txn = Transaction(
        user_id=1,
        date=date(2025, 11, 12),
        amount=Decimal("-2.99"),
        description="APPLE.COM/BILL 866-712-7753 CAUS",
        merchant="APPLE.COM/BILL",
        month="2025-11",
        pending=True,
    )
    db_session.add(txn)
    db_session.commit()
    db_session.flush()

    # Upload CSV with 3 transactions: 1 duplicate (APPLE), 2 new
    csv_content = b"""Date,Description,Comments,Check Number,Amount,Balance
11/12/2025,APPLE.COM/BILL 866-712-7753 CAUS,,,($2.99),$3642.56
11/12/2025,COLUMBIA GAS OF VIRGINICOLUMBUS OHUS,,,($41.75),$3600.81
11/13/2025,Wire Transfer Deposit FR KLEMET-NGUESSAN KOUAME N /x1112,,,$3628.37,$7229.18"""

    resp = client.post(
        "/ingest",
        files={"file": ("mixed.csv", csv_content, "text/csv")},
    )

    assert resp.status_code == 200, f"Ingest failed: {resp.text}"
    body = resp.json()

    # Should succeed with partial import
    assert body["ok"] is True, f"Expected ok=True, got {body}"
    assert (
        body["added"] == 2
    ), f"Expected added=2 (skipped 1 duplicate), got {body['added']}"
    assert (
        body["duplicates"] == 1
    ), f"Expected duplicates=1, got {body.get('duplicates', 0)}"
    assert body["count"] == 3, f"Expected count=3 total rows, got {body['count']}"

    # Verify only 3 total transactions in DB (1 seeded + 2 new)
    total = db_session.query(Transaction).filter(Transaction.user_id == 1).count()
    assert total == 3, f"Expected 3 total transactions, got {total}"


def test_ingest_replace_true_wipes_covered_months(client, user_override, db_session):
    """Replace mode should delete all existing transactions for months covered by CSV."""
    user_override.use(user_id=1, is_admin=False)

    # Seed some existing transactions in 2025-11
    old_txn1 = Transaction(
        user_id=1,
        date=date(2025, 11, 5),
        amount=Decimal("-10.00"),
        description="Old transaction 1",
        month="2025-11",
    )
    old_txn2 = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        amount=Decimal("-20.00"),
        description="Old transaction 2",
        month="2025-11",
    )
    # Seed transaction in different month (should NOT be deleted)
    other_month = Transaction(
        user_id=1,
        date=date(2025, 10, 15),
        amount=Decimal("-5.00"),
        description="October transaction",
        month="2025-10",
    )
    db_session.add_all([old_txn1, old_txn2, other_month])
    db_session.commit()
    db_session.flush()  # Ensure changes are visible to other sessions

    # Upload CSV with replace=true covering only 2025-11
    csv_content = b"""Date,Description,Comments,Check Number,Amount,Balance
11/12/2025,New transaction A,,,($30.00),$100.00
11/13/2025,New transaction B,,,($40.00),$60.00"""

    resp = client.post(
        "/ingest?replace=true",
        files={"file": ("replace.csv", csv_content, "text/csv")},
    )

    assert resp.status_code == 200, f"Ingest failed: {resp.text}"
    body = resp.json()

    assert body["ok"] is True, f"Expected ok=True, got {body}"
    assert body["added"] == 2, f"Expected added=2, got {body['added']}"

    # Verify old 2025-11 transactions are gone
    nov_txns = (
        db_session.query(Transaction)
        .filter(Transaction.user_id == 1, Transaction.month == "2025-11")
        .all()
    )
    descriptions = [t.description for t in nov_txns]
    assert "Old transaction 1" not in descriptions, "Old Nov txn should be deleted"
    assert "Old transaction 2" not in descriptions, "Old Nov txn should be deleted"
    assert "New transaction A" in descriptions, "New txn should exist"
    assert "New transaction B" in descriptions, "New txn should exist"

    # Verify October transaction still exists
    oct_txn = (
        db_session.query(Transaction)
        .filter(
            Transaction.user_id == 1,
            Transaction.month == "2025-10",
            Transaction.description == "October transaction",
        )
        .first()
    )
    assert oct_txn is not None, "October transaction should not be deleted"


def test_ingest_duplicate_constraint_safety_net(client, user_override, db_session):
    """Even if dedup logic fails, IntegrityError should be caught gracefully."""
    user_override.use(user_id=1, is_admin=False)

    # Seed duplicate transaction
    txn = Transaction(
        user_id=1,
        date=date(2025, 11, 12),
        amount=Decimal("-2.99"),
        description="APPLE.COM/BILL 866-712-7753 CAUS",
        merchant="APPLE.COM/BILL",
        month="2025-11",
    )
    db_session.add(txn)
    db_session.commit()

    # Upload CSV with same transaction (exact duplicate)
    csv_content = b"""Date,Description,Comments,Check Number,Amount,Balance
11/12/2025,APPLE.COM/BILL 866-712-7753 CAUS,,,($2.99),$3642.56"""

    resp = client.post(
        "/ingest",
        files={"file": ("dup.csv", csv_content, "text/csv")},
    )

    # Should NOT crash with 500
    assert resp.status_code in (
        200,
        400,
    ), f"Expected 200 or 400, got {resp.status_code}: {resp.text}"
    body = resp.json()

    # Should indicate error (not crash)
    assert body["ok"] is False, f"Expected ok=False for duplicate, got {body}"
    assert body.get("error") in (
        "all_rows_duplicate",
        "duplicate_constraint",
    ), f"Expected duplicate error, got {body.get('error')}"


def test_ingest_replace_with_full_bank_export(client, user_override, db_session):
    """Test replace mode with actual bank export file (multi-month)."""
    user_override.use(user_id=1, is_admin=False)

    # Seed some old data in Oct and Nov 2025
    old_oct = Transaction(
        user_id=1,
        date=date(2025, 10, 1),
        amount=Decimal("-100.00"),
        description="Old October data",
        month="2025-10",
    )
    old_nov = Transaction(
        user_id=1,
        date=date(2025, 11, 1),
        amount=Decimal("-200.00"),
        description="Old November data",
        month="2025-11",
    )
    db_session.add_all([old_oct, old_nov])
    db_session.commit()

    # Upload actual bank export file with replace=true
    csv_path = DATA_DIR / "export_20251112.csv"
    if not csv_path.exists():
        pytest.skip(f"Test data file not found: {csv_path}")

    with csv_path.open("rb") as f:
        resp = client.post(
            "/ingest?replace=true",
            files={"file": ("export_20251112.csv", f, "text/csv")},
        )

    assert resp.status_code == 200, f"Ingest failed: {resp.text}"
    body = resp.json()

    assert body["ok"] is True, f"Expected ok=True, got {body}"
    assert body["added"] > 0, f"Expected added > 0, got {body['added']}"

    # Verify old data for covered months is gone
    all_txns = db_session.query(Transaction).filter(Transaction.user_id == 1).all()
    descriptions = [t.description for t in all_txns]

    # Old transactions from covered months should be deleted
    assert "Old October data" not in descriptions, "Old Oct data should be replaced"
    assert "Old November data" not in descriptions, "Old Nov data should be replaced"


def test_unknown_format_includes_headers_found(client, user_override, tmp_path):
    """When CSV has unrecognized headers, response should include headers_found list."""
    user_override.use(user_id=1, is_admin=False)

    csv_path = tmp_path / "weird.csv"
    csv_path.write_text("Foo,Bar,Baz\n1,2,3\n", encoding="utf-8")

    with csv_path.open("rb") as f:
        resp = client.post("/ingest", files={"file": ("weird.csv", f, "text/csv")})

    body = resp.json()
    assert body["error"] == "unknown_format", f"Expected unknown_format error, got {body}"
    assert body["headers_found"] == ["foo", "bar", "baz"], f"Expected normalized headers, got {body.get('headers_found')}"
    assert body["message"] == "CSV format not recognized.", f"Expected short message, got {body.get('message')}"

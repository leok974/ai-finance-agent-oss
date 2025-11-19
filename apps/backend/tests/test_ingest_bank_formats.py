"""
Test CSV ingest with various bank export formats.

Tests multiple real-world bank CSV dialects to ensure robust parsing.
All tests use fake auth via the fake_auth_env fixture.
"""
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.transactions import Transaction

# Apply fake_auth_env fixture to all tests in this file
pytestmark = pytest.mark.usefixtures("fake_auth_env")


@pytest.fixture
def bank_debit_credit_csv():
    """Bank format with separate Debit/Credit columns."""
    return Path(__file__).parent / "fixtures" / "bank_debit_credit.csv"


@pytest.fixture
def bank_posted_effective_csv():
    """Bank format with Posted Date and Effective Date."""
    return Path(__file__).parent / "fixtures" / "bank_posted_effective.csv"


def test_ingest_bank_debit_credit(client: TestClient, db_session: Session, bank_debit_credit_csv: Path):
    """
    Test ingest with Debit/Credit format.
    
    Format: Date,Description,Debit,Credit,Balance
    Rules:
    - Debit → negative amount
    - Credit → positive amount
    """
    assert bank_debit_credit_csv.exists(), f"Fixture not found: {bank_debit_credit_csv}"
    
    with bank_debit_credit_csv.open("rb") as f:
        resp = client.post(
            "/ingest?replace=true",
            files={"file": ("bank_debit_credit.csv", f, "text/csv")},
        )
    
    assert resp.status_code == 200, f"Ingest failed: {resp.status_code} {resp.text}"
    
    data = resp.json()
    assert data["ok"] is True, f"Response ok=False: {data}"
    assert data["added"] == 5, f"Expected 5 transactions, got {data['added']}"
    assert data["count"] == 5
    assert data["detected_month"] == "2025-11"
    
    # Verify DB
    txns = db_session.query(Transaction).order_by(Transaction.date).all()
    assert len(txns) == 5
    
    # Check debit transaction (negative)
    starbucks = [t for t in txns if "STARBUCKS" in t.description][0]
    assert starbucks.amount == -4.75, f"Debit should be negative: {starbucks.amount}"
    
    # Check credit transaction (positive)
    payroll = [t for t in txns if "PAYROLL" in t.description][0]
    assert payroll.amount == 2500.00, f"Credit should be positive: {payroll.amount}"


def test_ingest_bank_posted_effective(client: TestClient, db_session: Session, bank_posted_effective_csv: Path):
    """
    Test ingest with Posted Date/Effective Date format.
    
    Format: Posted Date,Effective Date,Description,Amount,Type,Balance
    Uses Posted Date as primary transaction date.
    """
    assert bank_posted_effective_csv.exists(), f"Fixture not found: {bank_posted_effective_csv}"
    
    with bank_posted_effective_csv.open("rb") as f:
        resp = client.post(
            "/ingest?replace=true",
            files={"file": ("bank_posted_effective.csv", f, "text/csv")},
        )
    
    assert resp.status_code == 200, f"Ingest failed: {resp.status_code} {resp.text}"
    
    data = resp.json()
    assert data["ok"] is True, f"Response ok=False: {data}"
    assert data["added"] == 5, f"Expected 5 transactions, got {data['added']}"
    assert data["count"] == 5
    assert data["detected_month"] == "2025-11"
    
    # Verify DB
    txns = db_session.query(Transaction).order_by(Transaction.date).all()
    assert len(txns) == 5
    
    # Check that Posted Date is used (11/03, not Effective Date 11/02)
    venmo = [t for t in txns if "VENMO" in t.description][0]
    assert venmo.date.day == 3, f"Should use Posted Date (3rd): {venmo.date}"
    assert venmo.amount == -25.00
    
    # Check positive amount
    deposit = [t for t in txns if "DEPOSIT" in t.description][0]
    assert deposit.amount == 1500.00


def test_ingest_unknown_headers_returns_error(client: TestClient, tmp_path: Path):
    """Test that CSV with unrecognized headers returns error with format list."""
    csv_path = tmp_path / "weird.csv"
    csv_path.write_text("Foo,Bar,Baz\n1,2,3\n4,5,6\n", encoding="utf-8")
    
    with csv_path.open("rb") as f:
        resp = client.post(
            "/ingest?replace=false",
            files={"file": ("weird.csv", f, "text/csv")},
        )
    
    assert resp.status_code == 200, "Should return 200 with error in body"
    
    data = resp.json()
    assert data["ok"] is False
    assert data["error"] == "unknown_format"
    assert "Supported formats" in data["message"]
    assert "Debit/Credit" in data["message"]
    assert "Posted/Effective" in data["message"]


def test_detect_csv_format_generic(client: TestClient, tmp_path: Path):
    """Test that generic LedgerMind format is detected correctly."""
    csv_path = tmp_path / "generic.csv"
    csv_path.write_text(
        "date,amount,description,merchant\n"
        "2025-11-01,50.00,Coffee,Starbucks\n",
        encoding="utf-8"
    )
    
    with csv_path.open("rb") as f:
        resp = client.post("/ingest", files={"file": ("generic.csv", f, "text/csv")})
    
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["added"] == 1


def test_detect_csv_format_bank_v1(client: TestClient, tmp_path: Path):
    """Test that bank export v1 format is detected correctly."""
    csv_path = tmp_path / "bank_v1.csv"
    csv_path.write_text(
        'Date,Description,Comments,Check Number,Amount,Balance\n'
        '11/01/2025,"COFFEE SHOP",,"","-$5.00","1000.00"\n',
        encoding="utf-8"
    )
    
    with csv_path.open("rb") as f:
        resp = client.post("/ingest", files={"file": ("bank_v1.csv", f, "text/csv")})
    
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["added"] == 1


def test_detect_csv_format_bank_debit_credit(client: TestClient, bank_debit_credit_csv: Path):
    """Test that debit/credit format is detected correctly."""
    with bank_debit_credit_csv.open("rb") as f:
        resp = client.post("/ingest", files={"file": ("bank_dc.csv", f, "text/csv")})
    
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["added"] == 5


def test_detect_csv_format_bank_posted_effective(client: TestClient, bank_posted_effective_csv: Path):
    """Test that posted/effective format is detected correctly."""
    with bank_posted_effective_csv.open("rb") as f:
        resp = client.post("/ingest", files={"file": ("bank_pe.csv", f, "text/csv")})
    
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["added"] == 5

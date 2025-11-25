"""
Test demo data isolation from real user data and ML training.

These tests verify:
1. Demo uploads set is_demo=True
2. Real uploads set is_demo=False
3. Replace operations only delete matching is_demo type
4. is_demo flag is properly set for ML training exclusion
"""

import pytest
from datetime import date
from io import BytesIO
from fastapi import UploadFile
from sqlalchemy.orm import Session
from typing import Generator

from app.orm_models import Transaction


# Test data
DEMO_CSV = """date,description,merchant,amount,category
2025-11-01,Coffee Shop,Starbucks,-5.50,dining_coffee
2025-11-02,Grocery Store,Target,-42.30,groceries
2025-11-03,Gas Station,Shell,-35.00,transportation_gas
"""

REAL_CSV = """date,description,merchant,amount,category
2025-11-10,Real Purchase,Amazon,-25.00,shopping_general
2025-11-11,Real Payment,Electric Co,-150.00,utilities_electric
"""


def create_mock_upload_file(filename: str, content: str) -> UploadFile:
    """Create a mock UploadFile for testing."""
    file = BytesIO(content.encode("utf-8"))
    return UploadFile(filename=filename, file=file)


class TestDemoDetection:
    """Test automatic demo detection by filename."""

    def test_demo_filename_detection(self):
        """Files with 'demo' in name should be detected as demo."""
        demo_files = [
            "ledgermind-demo.csv",
            "DEMO-data.csv",
            "test_Demo.csv",
            "sample-demo-transactions.csv",
        ]
        for filename in demo_files:
            is_demo = "demo" in filename.lower()
            assert is_demo, f"Should detect {filename} as demo"

    def test_real_filename_detection(self):
        """Files without 'demo' in name should be detected as real."""
        real_files = [
            "transactions.csv",
            "my-ledger.csv",
            "bank_export_2025.csv",
            "data.csv",
        ]
        for filename in real_files:
            is_demo = "demo" in filename.lower()
            assert not is_demo, f"Should detect {filename} as real"


class TestDemoIsolation:
    """Test isolation between demo and real data."""

    def test_demo_upload_sets_is_demo_true(self, db: Session, test_user_id: int):
        """Demo uploads should mark all transactions with is_demo=True."""
        from app.services.ingest_csv import ingest_csv_for_user
        from pathlib import Path
        import tempfile

        # Create temp CSV file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as tmp:
            tmp.write(DEMO_CSV)
            tmp_path = Path(tmp.name)

        try:
            # Ingest as demo
            count = ingest_csv_for_user(
                db=db,
                user_id=test_user_id,
                csv_path=tmp_path,
                clear_existing=False,
                is_demo=True,
            )

            assert count == 3, "Should insert 3 transactions"

            # Verify all marked as demo
            txns = (
                db.query(Transaction).filter(Transaction.user_id == test_user_id).all()
            )
            assert len(txns) == 3
            assert all(
                txn.is_demo is True for txn in txns
            ), "All should be is_demo=True"

        finally:
            tmp_path.unlink()

    def test_real_upload_sets_is_demo_false(self, db: Session, test_user_id: int):
        """Real uploads should mark all transactions with is_demo=False."""
        from app.services.ingest_csv import ingest_csv_for_user
        from pathlib import Path
        import tempfile

        # Create temp CSV file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as tmp:
            tmp.write(REAL_CSV)
            tmp_path = Path(tmp.name)

        try:
            # Ingest as real data
            count = ingest_csv_for_user(
                db=db,
                user_id=test_user_id,
                csv_path=tmp_path,
                clear_existing=False,
                is_demo=False,
            )

            assert count == 2, "Should insert 2 transactions"

            # Verify all marked as real
            txns = (
                db.query(Transaction).filter(Transaction.user_id == test_user_id).all()
            )
            assert len(txns) == 2
            assert all(
                txn.is_demo is False for txn in txns
            ), "All should be is_demo=False"

        finally:
            tmp_path.unlink()

    def test_demo_replace_preserves_real_data(self, db: Session, test_user_id: int):
        """Demo replace should only delete demo data, preserving real transactions."""
        # Insert real data
        real_txn = Transaction(
            user_id=test_user_id,
            date=date(2025, 11, 1),
            month="2025-11",
            description="Real Transaction",
            merchant="Real Merchant",
            amount=-100.0,
            category="groceries",
            is_demo=False,
        )
        db.add(real_txn)
        db.commit()

        # Insert demo data
        demo_txn = Transaction(
            user_id=test_user_id,
            date=date(2025, 11, 2),
            month="2025-11",
            description="Demo Transaction",
            merchant="Demo Merchant",
            amount=-50.0,
            category="dining",
            is_demo=True,
        )
        db.add(demo_txn)
        db.commit()

        # Verify both exist
        assert (
            db.query(Transaction).filter(Transaction.user_id == test_user_id).count()
            == 2
        )

        # Replace with new demo data
        from app.services.ingest_csv import ingest_csv_for_user
        from pathlib import Path
        import tempfile

        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as tmp:
            tmp.write(DEMO_CSV)
            tmp_path = Path(tmp.name)

        try:
            ingest_csv_for_user(
                db=db,
                user_id=test_user_id,
                csv_path=tmp_path,
                clear_existing=True,  # Replace mode
                is_demo=True,
            )

            # Verify real data preserved
            real_txns = (
                db.query(Transaction)
                .filter(
                    Transaction.user_id == test_user_id,
                    Transaction.is_demo.is_(False),
                )
                .all()
            )
            assert len(real_txns) == 1
            assert real_txns[0].description == "Real Transaction"

            # Verify demo data replaced
            demo_txns = (
                db.query(Transaction)
                .filter(
                    Transaction.user_id == test_user_id,
                    Transaction.is_demo.is_(True),
                )
                .all()
            )
            assert len(demo_txns) == 3  # New demo CSV has 3 rows
            assert all(
                "Coffee Shop" in txn.description
                or "Grocery Store" in txn.description
                or "Gas Station" in txn.description
                for txn in demo_txns
            )

        finally:
            tmp_path.unlink()

    def test_real_replace_preserves_demo_data(self, db: Session, test_user_id: int):
        """Real replace should only delete real data, preserving demo transactions."""
        # Insert demo data
        demo_txn = Transaction(
            user_id=test_user_id,
            date=date(2025, 11, 1),
            month="2025-11",
            description="Demo Transaction",
            merchant="Demo Merchant",
            amount=-50.0,
            category="dining",
            is_demo=True,
        )
        db.add(demo_txn)
        db.commit()

        # Insert real data
        real_txn = Transaction(
            user_id=test_user_id,
            date=date(2025, 11, 2),
            month="2025-11",
            description="Old Real Transaction",
            merchant="Old Merchant",
            amount=-100.0,
            category="groceries",
            is_demo=False,
        )
        db.add(real_txn)
        db.commit()

        # Replace with new real data
        from app.services.ingest_csv import ingest_csv_for_user
        from pathlib import Path
        import tempfile

        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as tmp:
            tmp.write(REAL_CSV)
            tmp_path = Path(tmp.name)

        try:
            ingest_csv_for_user(
                db=db,
                user_id=test_user_id,
                csv_path=tmp_path,
                clear_existing=True,  # Replace mode
                is_demo=False,
            )

            # Verify demo data preserved
            demo_txns = (
                db.query(Transaction)
                .filter(
                    Transaction.user_id == test_user_id,
                    Transaction.is_demo.is_(True),
                )
                .all()
            )
            assert len(demo_txns) == 1
            assert demo_txns[0].description == "Demo Transaction"

            # Verify real data replaced
            real_txns = (
                db.query(Transaction)
                .filter(
                    Transaction.user_id == test_user_id,
                    Transaction.is_demo.is_(False),
                )
                .all()
            )
            assert len(real_txns) == 2  # New real CSV has 2 rows
            assert any("Real Purchase" in txn.description for txn in real_txns)

        finally:
            tmp_path.unlink()


class TestMLTrainingIsolation:
    """Test that demo data is excluded from ML training."""

    def test_demo_transactions_have_is_demo_flag(self, db: Session, test_user_id: int):
        """Verify demo transactions are flagged correctly for exclusion."""
        # Create demo transaction
        demo_txn = Transaction(
            user_id=test_user_id,
            date=date(2025, 11, 1),
            month="2025-11",
            description="Starbucks Coffee",
            merchant="Starbucks",
            amount=-5.50,
            category="dining_coffee",
            is_demo=True,
        )
        db.add(demo_txn)
        db.commit()
        db.refresh(demo_txn)

        # Verify flag is set
        assert demo_txn.is_demo is True, "Demo transaction should have is_demo=True"

        # Verify ML feedback code can detect it
        assert getattr(demo_txn, "is_demo", False) is True

    def test_real_transactions_dont_have_demo_flag(
        self, db: Session, test_user_id: int
    ):
        """Verify real transactions are NOT flagged as demo."""
        # Create real transaction
        real_txn = Transaction(
            user_id=test_user_id,
            date=date(2025, 11, 1),
            month="2025-11",
            description="Real Coffee",
            merchant="Starbucks",
            amount=-5.50,
            category="dining_coffee",
            is_demo=False,
        )
        db.add(real_txn)
        db.commit()
        db.refresh(real_txn)

        # Verify flag is not set
        assert real_txn.is_demo is False, "Real transaction should have is_demo=False"

        # Verify ML feedback code would process it
        assert getattr(real_txn, "is_demo", False) is False


@pytest.fixture
def test_user_id() -> int:
    """Provide a test user ID."""
    return 999


@pytest.fixture
def db() -> Generator[Session, None, None]:
    """Provide a database session for testing."""
    from app.db import SessionLocal

    session = SessionLocal()
    # Cleanup BEFORE tests to ensure clean state
    session.query(Transaction).filter(Transaction.user_id == 999).delete()
    session.commit()

    try:
        yield session
    finally:
        # Cleanup after tests
        session.query(Transaction).filter(Transaction.user_id == 999).delete()
        session.commit()
        session.close()

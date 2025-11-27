"""
Regression tests for /ingest/dashboard/reset behavior.

Ensures:
- Reset only deletes current user's transactions
- Demo data (DEMO_USER_ID) is unaffected by user reset
- Other users' data is unaffected
"""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.transactions import Transaction
from app.config import DEMO_USER_ID


def test_reset_only_affects_current_user(client: TestClient, db: Session):
    """
    Test that /ingest/dashboard/reset only deletes the current user's
    transactions, leaving demo data and other users untouched.
    """
    # Arrange: Create transactions for multiple users
    user_a_id = 8888
    user_b_id = 9999

    # User A transactions
    for i in range(3):
        db.add(
            Transaction(
                user_id=user_a_id,
                date=f"2025-11-0{i+1}",
                month="2025-11",
                merchant=f"Merchant A{i}",
                amount=-100.0,
                category="groceries",
                is_demo=False,
                source="csv",
            )
        )

    # User B transactions
    for i in range(2):
        db.add(
            Transaction(
                user_id=user_b_id,
                date=f"2025-11-0{i+1}",
                month="2025-11",
                merchant=f"Merchant B{i}",
                amount=-50.0,
                category="dining",
                is_demo=False,
                source="csv",
            )
        )

    # Demo transactions
    for i in range(5):
        db.add(
            Transaction(
                user_id=DEMO_USER_ID,
                date=f"2025-11-0{i+1}",
                month="2025-11",
                merchant=f"Demo Merchant {i}",
                amount=-25.0,
                category="shopping",
                is_demo=True,
                source="demo",
            )
        )

    db.commit()

    # Verify initial counts
    user_a_count = (
        db.query(Transaction).filter(Transaction.user_id == user_a_id).count()
    )
    user_b_count = (
        db.query(Transaction).filter(Transaction.user_id == user_b_id).count()
    )
    demo_count = (
        db.query(Transaction).filter(Transaction.user_id == DEMO_USER_ID).count()
    )

    assert user_a_count == 3
    assert user_b_count == 2
    assert demo_count == 5

    # Act: Reset User A's dashboard (simulate auth as User A)
    auth_headers = {"Authorization": f"Bearer fake_token_user_{user_a_id}"}
    response = client.post("/ingest/dashboard/reset", headers=auth_headers)

    # Assert: Response successful
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["deleted"] == 3  # User A's transactions

    # Assert: Only User A's transactions deleted
    user_a_after = (
        db.query(Transaction).filter(Transaction.user_id == user_a_id).count()
    )
    assert user_a_after == 0, "User A's transactions should be deleted"

    # Assert: User B's data untouched
    user_b_after = (
        db.query(Transaction).filter(Transaction.user_id == user_b_id).count()
    )
    assert user_b_after == user_b_count, "User B's transactions should remain"

    # Assert: Demo data untouched
    demo_after = (
        db.query(Transaction).filter(Transaction.user_id == DEMO_USER_ID).count()
    )
    assert demo_after == demo_count, "Demo transactions should remain"

    # Cleanup
    db.query(Transaction).filter(
        Transaction.user_id.in_([user_a_id, user_b_id, DEMO_USER_ID])
    ).delete()
    db.commit()


def test_reset_returns_zero_for_empty_user(client: TestClient, db: Session):
    """
    Test that resetting a user with no transactions returns deleted=0.
    """
    # Arrange: User with no transactions
    empty_user_id = 7777
    auth_headers = {"Authorization": f"Bearer fake_token_user_{empty_user_id}"}

    # Verify no transactions exist
    count = db.query(Transaction).filter(Transaction.user_id == empty_user_id).count()
    assert count == 0

    # Act: Reset empty user
    response = client.post("/ingest/dashboard/reset", headers=auth_headers)

    # Assert: Success with 0 deleted
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["deleted"] == 0

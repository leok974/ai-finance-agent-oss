"""
Regression tests for demo seed and reset behavior.

Ensures:
- Demo data only affects DEMO_USER_ID (not real users)
- /demo/seed creates transactions with is_demo=True for DEMO_USER_ID
- /demo/reset clears only DEMO_USER_ID's demo transactions
- Real user data is never affected by demo operations
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.transactions import Transaction
from app.config import DEMO_USER_ID


@pytest.fixture
def auth_headers(test_user_session):
    """Get auth headers for test user (NOT demo user)."""
    return {"Authorization": f"Bearer fake_token_user_{test_user_session.id}"}


def test_demo_seed_only_affects_demo_user(
    client: TestClient, auth_headers: dict, db: Session
):
    """
    Test that /demo/seed creates transactions ONLY for DEMO_USER_ID,
    never for the calling user.
    """
    # Arrange: Clear any existing demo data
    db.query(Transaction).filter(Transaction.user_id == DEMO_USER_ID).delete()
    db.commit()

    # Act: Seed demo data (as regular user)
    response = client.post(
        "/demo/seed",
        headers={**auth_headers, "X-LM-Demo-Seed": "1"},
    )

    # Assert: Response successful
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["transactions_added"] > 0

    # Assert: Transactions created for DEMO_USER_ID only
    demo_txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == DEMO_USER_ID,
            Transaction.is_demo == True,  # noqa: E712
        )
        .all()
    )
    assert len(demo_txns) == data["transactions_added"]

    # Assert: All demo transactions have correct flags
    for txn in demo_txns:
        assert txn.is_demo is True
        assert txn.source == "demo"
        assert txn.user_id == DEMO_USER_ID

    # Assert: No transactions created for the calling user
    # (auth_headers contains regular user, not DEMO_USER_ID)
    # We can't easily get user_id from fake auth headers, so we check that
    # only DEMO_USER_ID has transactions
    all_txns = db.query(Transaction).all()
    non_demo_users = {txn.user_id for txn in all_txns if txn.user_id != DEMO_USER_ID}
    assert (
        len(non_demo_users) == 0
    ), "Demo seed should not create transactions for real users"


def test_demo_reset_only_affects_demo_user(
    client: TestClient, auth_headers: dict, db: Session
):
    """
    Test that /demo/reset clears ONLY DEMO_USER_ID's transactions,
    leaving real user data untouched.
    """
    # Arrange: Seed demo data
    client.post(
        "/demo/seed",
        headers={**auth_headers, "X-LM-Demo-Seed": "1"},
    )

    # Create a fake real user transaction (simulate uploaded CSV)
    fake_user_id = 9999
    real_txn = Transaction(
        user_id=fake_user_id,
        date="2025-11-01",
        month="2025-11",
        merchant="Real Merchant",
        amount=-50.0,
        category="groceries",
        is_demo=False,
        source="csv",
    )
    db.add(real_txn)
    db.commit()

    demo_count_before = (
        db.query(Transaction).filter(Transaction.user_id == DEMO_USER_ID).count()
    )
    real_count_before = (
        db.query(Transaction).filter(Transaction.user_id == fake_user_id).count()
    )

    assert demo_count_before > 0, "Should have demo data before reset"
    assert real_count_before == 1, "Should have 1 real user transaction"

    # Act: Reset demo data
    response = client.post("/demo/reset", headers=auth_headers)

    # Assert: Response successful
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["transactions_cleared"] == demo_count_before

    # Assert: Demo transactions deleted
    demo_count_after = (
        db.query(Transaction).filter(Transaction.user_id == DEMO_USER_ID).count()
    )
    assert demo_count_after == 0, "All demo transactions should be deleted"

    # Assert: Real user data untouched
    real_count_after = (
        db.query(Transaction).filter(Transaction.user_id == fake_user_id).count()
    )
    assert real_count_after == real_count_before, "Real user transactions should remain"

    # Cleanup
    db.query(Transaction).filter(Transaction.user_id == fake_user_id).delete()
    db.commit()


def test_demo_seed_requires_header(client: TestClient, auth_headers: dict):
    """
    Test that /demo/seed rejects requests without X-LM-Demo-Seed header.
    This prevents accidental auto-seeding.
    """
    # Act: Try to seed without header
    response = client.post("/demo/seed", headers=auth_headers)

    # Assert: Forbidden
    assert response.status_code == 403
    data = response.json()
    assert data["reason"] == "missing_demo_seed_header"


def test_demo_seed_idempotent(client: TestClient, auth_headers: dict, db: Session):
    """
    Test that calling /demo/seed multiple times clears old data
    and reseeds fresh, maintaining consistent counts.
    """
    # Act: Seed twice
    response1 = client.post(
        "/demo/seed",
        headers={**auth_headers, "X-LM-Demo-Seed": "1"},
    )
    data1 = response1.json()
    count1 = data1["transactions_added"]

    response2 = client.post(
        "/demo/seed",
        headers={**auth_headers, "X-LM-Demo-Seed": "1"},
    )
    data2 = response2.json()
    count2 = data2["transactions_added"]

    # Assert: Both seeds successful
    assert response1.status_code == 200
    assert response2.status_code == 200

    # Assert: Second seed cleared first seed's data
    assert data2["transactions_cleared"] == count1

    # Assert: Same number of transactions added each time
    assert count1 == count2

    # Assert: Only one set of demo data exists
    final_count = (
        db.query(Transaction).filter(Transaction.user_id == DEMO_USER_ID).count()
    )
    assert final_count == count2

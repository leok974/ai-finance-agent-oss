"""
Tests for transaction status filtering (all/posted/pending).

Verifies that the /transactions endpoint correctly filters by pending status:
- status=all: returns both posted and pending transactions
- status=posted: returns only non-pending transactions
- status=pending: returns only pending transactions
"""

from datetime import date
from app.orm_models import Transaction


def test_transactions_filter_all_default(client, user_override, db_session):
    """Default behavior (status=all) should return both posted and pending."""
    # Set up auth with a fake user (id=1)
    user_override.use(user_id=1, is_admin=False)

    # Create one posted + one pending transaction
    posted_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        merchant="Test Store",
        description="Posted transaction",
        amount=10.00,
        category="Shopping",
        month="2025-11",
        pending=False,
    )
    pending_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 16),
        merchant="Pending Store",
        description="Processing... Pending transaction",
        amount=20.00,
        category="Shopping",
        month="2025-11",
        pending=True,
    )
    db_session.add_all([posted_txn, pending_txn])
    db_session.commit()
    db_session.refresh(posted_txn)
    db_session.refresh(pending_txn)

    posted_id = posted_txn.id
    pending_id = pending_txn.id

    # Query with default status (should be 'all')
    resp = client.get("/transactions")
    assert resp.status_code == 200

    data = resp.json()
    assert isinstance(data, list)

    ids = {t["id"] for t in data}
    assert posted_id in ids, "Posted transaction should be in default results"
    assert pending_id in ids, "Pending transaction should be in default results"


def test_transactions_filter_posted_only(client, user_override, db_session):
    """status=posted should return only non-pending transactions."""
    user_override.use(user_id=1, is_admin=False)

    posted_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        merchant="Test Store",
        description="Posted transaction",
        amount=10.00,
        category="Shopping",
        month="2025-11",
        pending=False,
    )
    pending_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 16),
        merchant="Pending Store",
        description="(Pending)",
        amount=20.00,
        category="Shopping",
        month="2025-11",
        pending=True,
    )
    db_session.add_all([posted_txn, pending_txn])
    db_session.commit()
    db_session.refresh(posted_txn)
    db_session.refresh(pending_txn)

    posted_id = posted_txn.id
    pending_id = pending_txn.id

    # Query with status=posted
    resp = client.get("/transactions?status=posted")
    assert resp.status_code == 200

    data = resp.json()
    ids = {t["id"] for t in data}

    assert posted_id in ids, "Posted transaction should be included"
    assert pending_id not in ids, "Pending transaction should NOT be included"

    # Verify pending field is present and correct
    posted_item = next((t for t in data if t["id"] == posted_id), None)
    assert posted_item is not None
    assert posted_item["pending"] is False


def test_transactions_filter_pending_only(client, user_override, db_session):
    """status=pending should return only pending transactions."""
    user_override.use(user_id=1, is_admin=False)

    posted_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        merchant="Test Store",
        description="Posted transaction",
        amount=10.00,
        category="Shopping",
        month="2025-11",
        pending=False,
    )
    pending_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 16),
        merchant="Pending Store",
        description="Processing...",
        amount=20.00,
        category="Shopping",
        month="2025-11",
        pending=True,
    )
    db_session.add_all([posted_txn, pending_txn])
    db_session.commit()
    db_session.refresh(posted_txn)
    db_session.refresh(pending_txn)

    posted_id = posted_txn.id
    pending_id = pending_txn.id

    # Query with status=pending
    resp = client.get("/transactions?status=pending")
    assert resp.status_code == 200

    data = resp.json()
    ids = {t["id"] for t in data}

    assert pending_id in ids, "Pending transaction should be included"
    assert posted_id not in ids, "Posted transaction should NOT be included"

    # Verify pending field is present and correct
    pending_item = next((t for t in data if t["id"] == pending_id), None)
    assert pending_item is not None
    assert pending_item["pending"] is True


def test_transactions_filter_all_explicit(client, user_override, db_session):
    """status=all (explicit) should return both posted and pending."""
    user_override.use(user_id=1, is_admin=False)

    posted_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        merchant="Test Store",
        description="Posted transaction",
        amount=10.00,
        category="Shopping",
        month="2025-11",
        pending=False,
    )
    pending_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 16),
        merchant="Pending Store",
        description="(Pending)",
        amount=20.00,
        category="Shopping",
        month="2025-11",
        pending=True,
    )
    db_session.add_all([posted_txn, pending_txn])
    db_session.commit()
    db_session.refresh(posted_txn)
    db_session.refresh(pending_txn)

    posted_id = posted_txn.id
    pending_id = pending_txn.id

    # Query with status=all (explicit)
    resp = client.get("/transactions?status=all")
    assert resp.status_code == 200

    data = resp.json()
    ids = {t["id"] for t in data}

    assert posted_id in ids, "Posted transaction should be in all results"
    assert pending_id in ids, "Pending transaction should be in all results"


def test_transactions_filter_invalid_status(client, user_override):
    """Invalid status value should return 422 validation error."""
    user_override.use(user_id=1, is_admin=False)
    resp = client.get("/transactions?status=invalid")
    assert resp.status_code == 422  # FastAPI validation error


def test_transactions_filter_user_isolation(client, user_override, db_session):
    """Status filter should respect user isolation (only show own transactions)."""
    # Set up auth as user_id=1
    user_override.use(user_id=1, is_admin=False)

    my_pending = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        merchant="My Store",
        description="(Pending)",
        amount=10.00,
        category="Shopping",
        month="2025-11",
        pending=True,
    )

    # Create transaction for another user
    other_pending = Transaction(
        user_id=999,
        date=date(2025, 11, 16),
        merchant="Other Store",
        description="(Pending)",
        amount=20.00,
        category="Shopping",
        month="2025-11",
        pending=True,
    )

    db_session.add_all([my_pending, other_pending])
    db_session.commit()
    db_session.refresh(my_pending)
    db_session.refresh(other_pending)

    my_id = my_pending.id
    other_id = other_pending.id

    # Query pending transactions (authenticated as user_id=1)
    resp = client.get("/transactions?status=pending")
    assert resp.status_code == 200

    data = resp.json()
    ids = {t["id"] for t in data}

    assert my_id in ids, "Should include own pending transaction"
    assert other_id not in ids, "Should NOT include other user's transaction"

"""
Test /agent/tools/insights/expanded with pending status filter.
"""

import pytest
from decimal import Decimal
from datetime import date
from app.orm_models import Transaction

pytestmark = pytest.mark.usefixtures("fake_auth_env")


def test_summary_default_excludes_pending(client, user_override, db_session):
    """Default behavior: only posted transactions in summary."""
    user_override.use(user_id=1, is_admin=False)
    month = "2025-11"

    # Posted: -50 spend
    posted = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        amount=Decimal("-50.00"),
        pending=False,
        category="Groceries",
        merchant="Store A",
        month=month,
        description="Posted",
    )

    # Pending: -20 spend (should be excluded by default)
    pending_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 16),
        amount=Decimal("-20.00"),
        pending=True,
        category="Groceries",
        merchant="Store B",
        month=month,
        description="Pending",
    )

    db_session.add_all([posted, pending_txn])
    db_session.commit()

    resp = client.post("/agent/tools/insights/expanded", json={"month": month})
    assert resp.status_code == 200
    data = resp.json()

    # Should only include posted transaction (-50)
    assert data["summary"]["spend"] == 50.0
    assert data["summary"]["income"] == 0.0
    assert data["summary"]["net"] == -50.0


def test_summary_status_posted_explicit(client, user_override, db_session):
    """Explicitly request posted transactions only."""
    user_override.use(user_id=1, is_admin=False)
    month = "2025-11"

    posted = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        amount=Decimal("-50.00"),
        pending=False,
        month=month,
    )

    pending_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 16),
        amount=Decimal("-20.00"),
        pending=True,
        month=month,
    )

    db_session.add_all([posted, pending_txn])
    db_session.commit()

    resp = client.post(
        "/agent/tools/insights/expanded",
        json={"month": month, "status": "posted"},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Should only include posted transaction
    assert data["summary"]["spend"] == 50.0


def test_summary_status_pending_only(client, user_override, db_session):
    """Request pending transactions only."""
    user_override.use(user_id=1, is_admin=False)
    month = "2025-11"

    posted = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        amount=Decimal("-50.00"),
        pending=False,
        month=month,
    )

    pending_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 16),
        amount=Decimal("-20.00"),
        pending=True,
        month=month,
    )

    db_session.add_all([posted, pending_txn])
    db_session.commit()

    resp = client.post(
        "/agent/tools/insights/expanded",
        json={"month": month, "status": "pending"},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Should only include pending transaction
    assert data["summary"]["spend"] == 20.0


def test_summary_status_all_includes_both(client, user_override, db_session):
    """Request all transactions (posted + pending)."""
    user_override.use(user_id=1, is_admin=False)
    month = "2025-11"

    posted = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        amount=Decimal("-50.00"),
        pending=False,
        month=month,
    )

    pending_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 16),
        amount=Decimal("-20.00"),
        pending=True,
        month=month,
    )

    db_session.add_all([posted, pending_txn])
    db_session.commit()

    resp = client.post(
        "/agent/tools/insights/expanded",
        json={"month": month, "status": "all"},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Should include both transactions
    assert data["summary"]["spend"] == 70.0


def test_summary_top_categories_filters_pending(client, user_override, db_session):
    """Top categories should respect pending filter."""
    user_override.use(user_id=1, is_admin=False)
    month = "2025-11"

    # Posted: -50 Groceries
    posted = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        amount=Decimal("-50.00"),
        pending=False,
        category="Groceries",
        month=month,
    )

    # Pending: -100 Dining (should be excluded by default)
    pending_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 16),
        amount=Decimal("-100.00"),
        pending=True,
        category="Dining",
        month=month,
    )

    db_session.add_all([posted, pending_txn])
    db_session.commit()

    resp = client.post("/agent/tools/insights/expanded", json={"month": month})
    assert resp.status_code == 200
    data = resp.json()

    top_cats = data.get("top_categories", [])
    # Should only have Groceries (posted)
    cat_names = [c["category"] for c in top_cats]
    assert "Groceries" in cat_names
    assert "Dining" not in cat_names


def test_summary_top_categories_includes_pending_when_all(
    client, user_override, db_session
):
    """Top categories should include pending when status=all."""
    user_override.use(user_id=1, is_admin=False)
    month = "2025-11"

    # Posted: -50 Groceries
    posted = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        amount=Decimal("-50.00"),
        pending=False,
        category="Groceries",
        month=month,
    )

    # Pending: -100 Dining
    pending_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 16),
        amount=Decimal("-100.00"),
        pending=True,
        category="Dining",
        month=month,
    )

    db_session.add_all([posted, pending_txn])
    db_session.commit()

    resp = client.post(
        "/agent/tools/insights/expanded",
        json={"month": month, "status": "all"},
    )
    assert resp.status_code == 200
    data = resp.json()

    top_cats = data.get("top_categories", [])
    cat_names = [c["category"] for c in top_cats]
    # Should have both categories
    assert "Groceries" in cat_names
    assert "Dining" in cat_names


def test_summary_top_merchants_filters_pending(client, user_override, db_session):
    """Top merchants should respect pending filter."""
    user_override.use(user_id=1, is_admin=False)
    month = "2025-11"

    # Posted: -50 Store A
    posted = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        amount=Decimal("-50.00"),
        pending=False,
        merchant="Store A",
        month=month,
    )

    # Pending: -100 Store B (should be excluded by default)
    pending_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 16),
        amount=Decimal("-100.00"),
        pending=True,
        merchant="Store B",
        month=month,
    )

    db_session.add_all([posted, pending_txn])
    db_session.commit()

    resp = client.post("/agent/tools/insights/expanded", json={"month": month})
    assert resp.status_code == 200
    data = resp.json()

    top_merch = data.get("top_merchants", [])
    merch_names = [m["merchant"] for m in top_merch]
    # Should only have Store A (posted)
    assert "Store A" in merch_names
    assert "Store B" not in merch_names


def test_summary_large_transactions_filters_pending(client, user_override, db_session):
    """Large transactions should respect pending filter."""
    user_override.use(user_id=1, is_admin=False)
    month = "2025-11"

    # Posted: -500 (large)
    posted = Transaction(
        user_id=1,
        date=date(2025, 11, 15),
        amount=Decimal("-500.00"),
        pending=False,
        description="Large Posted",
        month=month,
    )

    # Pending: -600 (large, should be excluded by default)
    pending_txn = Transaction(
        user_id=1,
        date=date(2025, 11, 16),
        amount=Decimal("-600.00"),
        pending=True,
        description="Large Pending",
        month=month,
    )

    db_session.add_all([posted, pending_txn])
    db_session.commit()

    resp = client.post(
        "/agent/tools/insights/expanded",
        json={"month": month, "large_limit": 10},
    )
    assert resp.status_code == 200
    data = resp.json()

    large = data.get("large_transactions", [])
    descriptions = [t["description"] for t in large]
    # Should only have posted large transaction
    assert "Large Posted" in descriptions
    assert "Large Pending" not in descriptions

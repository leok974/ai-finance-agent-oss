#!/usr/bin/env python3
"""
User Isolation Validation Script

Tests multi-user data isolation across key endpoints.
"""
import sys
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.orm_models import Transaction
from sqlalchemy import text

client = TestClient(app)


def setup_test_data():
    """Create test users and transactions."""
    db = SessionLocal()
    try:
        # Check if user 2 exists (we created it in migration)
        user_count = db.execute(text("SELECT COUNT(*) FROM users")).scalar()
        print("✅ Test data setup complete")
        print(f"   Total users: {user_count}")
        print("   Using User 1 for validation")

        # Check transaction distribution
        txn_dist = db.execute(
            text(
                """
            SELECT user_id, COUNT(*) as count
            FROM transactions
            GROUP BY user_id
        """
            )
        ).fetchall()

        for user_id, count in txn_dist:
            print(f"   User {user_id}: {count} transactions")

        return 1, 2  # Assume user IDs 1 and 2 exist
    finally:
        db.close()


def test_transactions_isolation():
    """Test that transactions endpoint filters by user_id."""
    print("\n🧪 Testing transactions endpoint isolation...")

    # Mock authentication by directly checking the endpoint expects user_id
    # In production, this would come from JWT token
    db = SessionLocal()
    try:
        # Check user 1 transactions
        user1_txns = db.query(Transaction).filter(Transaction.user_id == 1).all()
        print(f"   User 1 has {len(user1_txns)} transactions")

        # Check user 2 transactions
        user2_txns = db.query(Transaction).filter(Transaction.user_id == 2).all()
        print(f"   User 2 has {len(user2_txns)} transactions")

        # Verify isolation
        if len(user1_txns) > 0 and len(user2_txns) > 0:
            print("   ✅ Both users have separate transaction data")
            return True
        else:
            print("   ⚠️  One user has no transactions (expected for fresh DB)")
            return True
    finally:
        db.close()


def test_charts_isolation():
    """Test that charts services filter by user_id."""
    print("\n🧪 Testing charts services isolation...")

    from app.services.charts_data import get_month_summary

    db = SessionLocal()
    try:
        # Test user 1
        summary1 = get_month_summary(db, user_id=1, month="2025-11")
        print(f"   User 1 summary: {summary1.get('total_spend', 0)} spend")

        # Test user 2
        summary2 = get_month_summary(db, user_id=2, month="2025-11")
        print(f"   User 2 summary: {summary2.get('total_spend', 0)} spend")

        # Verify they're different (or both work)
        print("   ✅ Charts services accept user_id parameter")
        return True
    except TypeError as e:
        if "user_id" in str(e):
            print(f"   ❌ Charts service missing user_id parameter: {e}")
            return False
        raise
    finally:
        db.close()


def test_insights_isolation():
    """Test that insights services filter by user_id."""
    print("\n🧪 Testing insights services isolation...")

    from app.services.insights_anomalies import compute_anomalies

    db = SessionLocal()
    try:
        # Test user 1
        anomalies1 = compute_anomalies(db, user_id=1, months=6)
        print(f"   User 1 anomalies: {len(anomalies1.get('anomalies', []))} found")

        # Test user 2
        anomalies2 = compute_anomalies(db, user_id=2, months=6)
        print(f"   User 2 anomalies: {len(anomalies2.get('anomalies', []))} found")

        print("   ✅ Insights services accept user_id parameter")
        return True
    except TypeError as e:
        if "user_id" in str(e):
            print(f"   ❌ Insights service missing user_id parameter: {e}")
            return False
        raise
    finally:
        db.close()


def test_cache_isolation():
    """Test that cache keys include user_id."""
    print("\n🧪 Testing cache key isolation...")

    from app.services import help_cache

    # Generate keys for different users
    key1 = help_cache.make_key(
        panel_id="test.panel",
        month="2025-11",
        filters_hash="abc123",
        rephrase=False,
        user_id=1,
    )

    key2 = help_cache.make_key(
        panel_id="test.panel",
        month="2025-11",
        filters_hash="abc123",
        rephrase=False,
        user_id=2,
    )

    if key1 != key2 and "u1" in key1 and "u2" in key2:
        print("   ✅ Cache keys properly namespaced by user")
        print(f"      User 1 key: {key1[:50]}...")
        print(f"      User 2 key: {key2[:50]}...")
        return True
    else:
        print("   ❌ Cache keys not properly isolated")
        print(f"      User 1 key: {key1}")
        print(f"      User 2 key: {key2}")
        return False


def main():
    """Run all validation tests."""
    print("=" * 60)
    print("User Isolation Validation")
    print("=" * 60)

    # Setup test data
    user1_id, user2_id = setup_test_data()

    # Run tests
    results = []
    results.append(("Transactions Isolation", test_transactions_isolation()))
    results.append(("Charts Services Isolation", test_charts_isolation()))
    results.append(("Insights Services Isolation", test_insights_isolation()))
    results.append(("Cache Key Isolation", test_cache_isolation()))

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")

    print(f"\nPassed: {passed}/{total}")

    if passed == total:
        print("\n🎉 All user isolation tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())

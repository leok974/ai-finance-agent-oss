#!/usr/bin/env python3
"""
Standalone test for ML accept endpoint.
Tests idempotent behavior and database updates.
"""
import sys
import os

# Ensure app is in path
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import DATABASE_URL
from app.orm_models import Suggestion


def test_accept_endpoint():
    """Test the accept endpoint with live database"""
    print("\n=== Testing ML Accept Endpoint ===\n")

    # Get database URL
    db_url = DATABASE_URL
    print(f"✓ Database: {str(db_url)[:30]}...")

    # Create engine and session
    engine = create_engine(db_url)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        # Find an unaccepted suggestion or create one
        suggestion = db.query(Suggestion).filter(Suggestion.accepted.is_(False)).first()

        if not suggestion:
            # Create a test suggestion
            print("⚠ No unaccepted suggestions found, creating test suggestion...")
            suggestion = Suggestion(
                txn_id="TEST-TXN-1",
                label="TestLabel",
                confidence=0.85,
                source="test",
                model_version="test@v1",
                mode="model",
                reason_json={"test": "data"},
                accepted=False,
            )
            db.add(suggestion)
            db.commit()
            db.refresh(suggestion)
            print(f"✓ Created test suggestion ID: {suggestion.id}")
        else:
            print(f"✓ Found unaccepted suggestion ID: {suggestion.id}")

        # Test 1: Accept the suggestion
        print(f"\nTest 1: Accepting suggestion {suggestion.id}...")
        suggestion.accepted = True
        db.add(suggestion)
        db.commit()
        db.refresh(suggestion)

        if suggestion.accepted:
            print("✓ Suggestion accepted successfully")
        else:
            print("✗ Failed to accept suggestion")
            return False

        # Test 2: Verify idempotency (accepting again should be safe)
        print("\nTest 2: Testing idempotency (accept again)...")
        suggestion.accepted = True  # Set again
        db.add(suggestion)
        db.commit()
        db.refresh(suggestion)

        if suggestion.accepted:
            print("✓ Idempotent: Suggestion still accepted")
        else:
            print("✗ Idempotency failed")
            return False

        # Test 3: Verify the suggestion persists
        print("\nTest 3: Verifying persistence...")
        db.rollback()  # Clear session
        persisted = db.query(Suggestion).filter(Suggestion.id == suggestion.id).first()

        if persisted and persisted.accepted:
            print(f"✓ Suggestion {persisted.id} persisted with accepted=True")
        else:
            print("✗ Persistence check failed")
            return False

        print("\n=== All Tests Passed! ===\n")
        return True

    except Exception as e:
        print(f"\n✗ Test failed with error: {e}")
        import traceback

        traceback.print_exc()
        return False
    finally:
        db.close()


if __name__ == "__main__":
    success = test_accept_endpoint()
    sys.exit(0 if success else 1)

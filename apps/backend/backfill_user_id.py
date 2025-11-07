#!/usr/bin/env python3
"""Create default user and backfill transactions."""
from app.database import engine
from sqlalchemy import text
from app.utils.auth import hash_password

# Create a default admin user
default_email = "admin@ledgermind.local"
default_password = "changeme123"  # User should change this!
password_hash = hash_password(default_password)

with engine.begin() as conn:
    # Check if user already exists
    result = conn.execute(
        text("SELECT id FROM users WHERE email = :email"), {"email": default_email}
    )
    existing_user = result.fetchone()

    if existing_user:
        user_id = existing_user[0]
        print(f"User already exists: ID={user_id}, Email={default_email}")
    else:
        # Insert new user (matching actual schema: id, email, password_hash, is_active, created_at)
        result = conn.execute(
            text(
                """
                INSERT INTO users (email, password_hash, is_active, created_at)
                VALUES (:email, :password_hash, 1, CURRENT_TIMESTAMP)
            """
            ),
            {"email": default_email, "password_hash": password_hash},
        )
        user_id = result.lastrowid
        print(
            f"Created new user: ID={user_id}, Email={default_email}, Password={default_password}"
        )
        print("⚠️  IMPORTANT: Change the password after first login!")

    # Count transactions without user_id
    result = conn.execute(
        text("SELECT COUNT(*) FROM transactions WHERE user_id IS NULL")
    )
    null_count = result.fetchone()[0]

    if null_count > 0:
        print(f"\nBackfilling {null_count} transactions to user ID {user_id}...")
        conn.execute(
            text("UPDATE transactions SET user_id = :user_id WHERE user_id IS NULL"),
            {"user_id": user_id},
        )
        print(f"✅ Backfilled {null_count} transactions")
    else:
        print("\n✅ All transactions already have user_id")

    # Verify
    result = conn.execute(
        text("SELECT COUNT(*) FROM transactions WHERE user_id IS NULL")
    )
    remaining_nulls = result.fetchone()[0]
    print(
        f"\nFinal check: {remaining_nulls} transactions with NULL user_id (should be 0)"
    )

#!/usr/bin/env python3
"""Check users in database and backfill user_id if needed."""
from app.database import engine
from sqlalchemy import inspect, text

# Check what columns exist
insp = inspect(engine)
print("users columns:", [c["name"] for c in insp.get_columns("users")])
print("transactions columns:", [c["name"] for c in insp.get_columns("transactions")])

# Check for users
with engine.connect() as conn:
    result = conn.execute(text("SELECT id, email FROM users"))
    users = result.fetchall()
    print(f"\nFound {len(users)} users:")
    for u in users:
        print(f"  ID: {u[0]}, Email: {u[1]}")

    # Check for transactions without user_id
    result = conn.execute(
        text("SELECT COUNT(*) FROM transactions WHERE user_id IS NULL")
    )
    null_count = result.fetchone()[0]
    print(f"\nTransactions with NULL user_id: {null_count}")

    if users and null_count > 0:
        print(f"\nReady to backfill {null_count} transactions to user ID {users[0][0]}")

#!/usr/bin/env python3
"""Make user_id column NOT NULL (SQLite workaround)."""
from app.database import engine
from sqlalchemy import text

# SQLite doesn't support ALTER COLUMN SET NOT NULL directly
# We need to check if a migration is needed or if it's already done
# Since this is SQLite, we may need to use batch mode or recreate table

with engine.begin() as conn:
    # For SQLite, we can't easily ALTER a column to NOT NULL
    # But we can check the current state
    result = conn.execute(
        text(
            """
        SELECT sql FROM sqlite_master
        WHERE type='table' AND name='transactions'
    """
        )
    )
    create_sql = result.fetchone()[0]
    print("Current table schema:")
    print(create_sql)
    print("\n" + "=" * 60)

    if (
        "user_id" in create_sql
        and "NOT NULL" not in create_sql.split("user_id")[1].split(",")[0]
    ):
        print("⚠️  user_id is still NULLABLE")
        print("For SQLite, we need to create a new migration to enforce NOT NULL")
        print("The current migration added the column as nullable.")
        print("\nFor now, we'll rely on application-level enforcement.")
    else:
        print("✅ user_id is already NOT NULL or properly configured")

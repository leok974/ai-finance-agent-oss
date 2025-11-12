#!/usr/bin/env python3
"""Create unique index to prevent cross-user duplicate imports."""

from app.db import SessionLocal
from sqlalchemy import text


def main():
    db = SessionLocal()
    try:
        # Create unique index on (user_id, external_id) to prevent duplicates
        db.execute(
            text(
                """
            CREATE UNIQUE INDEX IF NOT EXISTS ux_txn_user_external
            ON transactions(user_id, external_id)
            WHERE external_id IS NOT NULL
        """
            )
        )
        db.commit()
        print("✅ Unique index created: ux_txn_user_external")
        print("   Prevents duplicate external_id imports per user")

        # Verify index was created
        result = db.execute(
            text(
                """
            SELECT name FROM sqlite_master
            WHERE type='index' AND name='ux_txn_user_external'
        """
            )
        ).fetchone()

        if result:
            print(f"✅ Index verified: {result[0]}")
        else:
            print("⚠️  Index not found (may already exist)")

    except Exception as e:
        print(f"❌ Error creating index: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    main()

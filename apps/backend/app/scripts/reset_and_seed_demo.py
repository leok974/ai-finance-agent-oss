#!/usr/bin/env python3
"""
Reset and re-seed demo user with fresh CSV data.

This script:
1. Deletes all existing transactions for the demo user
2. Ingests fresh data from sample_hints_pass3_real_data.csv
3. Maps CSV categories to internal slugs automatically

Usage:
    python -m app.scripts.reset_and_seed_demo [user_id]

Examples:
    python -m app.scripts.reset_and_seed_demo         # Use default demo user (ID 6)
    python -m app.scripts.reset_and_seed_demo 42      # Reset user ID 42

    # In Docker container:
    docker exec ai-finance-backend python -m app.scripts.reset_and_seed_demo
"""

import sys
from typing import Optional

from app.db import SessionLocal
from app.services.ingest_csv import ingest_demo_csv

# Default demo user ID (adjust if needed)
DEFAULT_DEMO_USER_ID = 6


def main(user_id: Optional[int] = None) -> None:
    """
    Reset and re-seed demo data for a user.

    Args:
        user_id: User ID to reset (defaults to DEFAULT_DEMO_USER_ID)
    """
    if user_id is None:
        user_id = DEFAULT_DEMO_USER_ID
        print(f"Using default demo user ID: {user_id}")

    db = SessionLocal()
    try:
        print(f"\n{'='*60}")
        print(f"Resetting demo data for user {user_id}")
        print(f"{'='*60}\n")

        # Ingest demo CSV (clears existing transactions automatically)
        count = ingest_demo_csv(db, user_id, clear_existing=True)

        print(f"\n{'='*60}")
        print("✓ Demo reset complete!")
        print(f"  User: {user_id}")
        print(f"  Transactions: {count}")
        print(f"{'='*60}\n")

        print("Next steps:")
        print("1. Refresh the app in your browser")
        print("2. Check dashboard for diverse categories")
        print("3. Verify Top Categories chart shows multiple bars")

    except FileNotFoundError as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        print("\nMake sure sample_hints_pass3_real_data.csv exists at:")
        print("  apps/backend/sample_hints_pass3_real_data.csv")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    uid = int(sys.argv[1]) if len(sys.argv) > 1 else None
    main(uid)

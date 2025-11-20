#!/usr/bin/env python3
"""
Manually drop legacy rule_suggestions tables in production.
This bypasses migration issues and completes Phase 2 cleanup.
"""

from app.db import engine
from sqlalchemy import text


def main():
    print("=" * 70)
    print("  Phase 2: Manual Legacy Table Cleanup (Production)")
    print("=" * 70)

    with engine.begin() as conn:
        print("\nDropping legacy tables...")

        # Check if tables exist first
        result = conn.execute(
            text(
                """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('rule_suggestions', 'rule_suggestion_ignores')
        """
            )
        )
        existing_tables = [row[0] for row in result]

        if not existing_tables:
            print("  ℹ No legacy tables found - already clean!")
            return

        print(f"  Found legacy tables: {', '.join(existing_tables)}")

        # Drop rule_suggestion_ignores first (has FK to rule_suggestions)
        if "rule_suggestion_ignores" in existing_tables:
            conn.execute(text("DROP TABLE rule_suggestion_ignores CASCADE"))
            print("  ✓ Dropped rule_suggestion_ignores")

        # Drop rule_suggestions
        if "rule_suggestions" in existing_tables:
            conn.execute(text("DROP TABLE rule_suggestions CASCADE"))
            print("  ✓ Dropped rule_suggestions")

        # Verify removal
        result = conn.execute(
            text(
                """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('rule_suggestions', 'rule_suggestion_ignores')
        """
            )
        )
        remaining = [row[0] for row in result]

        if not remaining:
            print("\n✓ Legacy tables successfully removed!")
            print("  Phase 2 cleanup complete in production")
        else:
            print(f"\n✗ Warning: Tables still exist: {', '.join(remaining)}")

    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()

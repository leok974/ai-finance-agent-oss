#!/usr/bin/env python3
"""Verify production deployment of Phase 1-3 changes."""

from app.db import engine
from sqlalchemy import text, inspect


def main():
    print("=" * 70)
    print("  Phase 1-3 Deployment Verification (Production)")
    print("=" * 70)

    with engine.connect() as conn:
        # Check migration version
        version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        print(f"\n✓ Migration version: {version}")

        if version == "fe374f90af1f":
            print("  ✓ Phase 2 migration applied successfully!")
        else:
            print(f"  ⚠ Expected fe374f90af1f, got {version}")

        # Check if legacy tables were dropped
        inspector = inspect(engine)
        tables = inspector.get_table_names()

        print(f"\n✓ Total tables: {len(tables)}")

        legacy_suggestions = "rule_suggestions" in tables
        legacy_ignores = "rule_suggestion_ignores" in tables

        if not legacy_suggestions and not legacy_ignores:
            print("  ✓ Legacy tables successfully removed!")
        else:
            if legacy_suggestions:
                print("  ✗ rule_suggestions table still exists")
            if legacy_ignores:
                print("  ✗ rule_suggestion_ignores table still exists")

        # Check if ML feedback tables exist
        ml_tables = [
            "ml_feedback_events",
            "ml_feedback_merchant_category_stats",
            "merchant_category_hints",
        ]

        print("\n✓ ML Feedback System Tables:")
        for table in ml_tables:
            exists = table in tables
            status = "✓" if exists else "✗"
            print(f"  {status} {table}: {'present' if exists else 'MISSING'}")

        # Check merchant_category_hints has data
        result = conn.execute(text("SELECT COUNT(*) FROM merchant_category_hints"))
        hint_count = result.scalar()
        print(f"\n✓ Merchant hints promoted: {hint_count}")

    print("\n" + "=" * 70)
    print("  Verification Complete!")
    print("=" * 70)


if __name__ == "__main__":
    main()

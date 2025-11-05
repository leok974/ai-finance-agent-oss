#!/usr/bin/env python3
"""Check seeded labels count."""
from app.db import engine
from sqlalchemy import text
with engine.connect() as conn:
    result = conn.execute(text(
        "SELECT label, COUNT(*) as cnt "
        "FROM transaction_labels "
        "WHERE source='seed_rules_20251104' "
        "GROUP BY label "
        "ORDER BY cnt DESC"
    ))
    
    print("\n📊 Seeded Labels (seed_rules_20251104):")
    print("=" * 40)
    rows = list(result)
    if rows:
        for label, count in rows:
            print(f"  {label:20s}: {count:3d}")
        total = sum(r[1] for r in rows)
        print("=" * 40)
        print(f"  {'TOTAL':20s}: {total:3d}")
    else:
        print("  No labels found.")

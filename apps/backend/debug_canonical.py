from app.utils.text import canonicalize_merchant
from app.db import SessionLocal
from sqlalchemy import text

# Test canonicalization
merchant = "CVS"
desc = "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON"

canonical1 = canonicalize_merchant(merchant)
canonical2 = canonicalize_merchant(desc)

print(f"Merchant '{merchant}' → '{canonical1}'")
print(f"Description '{desc}' → '{canonical2}'")

# Check what's in the database
db = SessionLocal()
hints = db.execute(
    text(
        """
    SELECT merchant_canonical, category_slug, confidence
    FROM merchant_category_hints
    WHERE source = 'test_seed'
"""
    )
).fetchall()

print("\nHints in database:")
for h in hints:
    print(f"  '{h[0]}' → {h[1]} (conf={h[2]})")

# Try to find hint for CVS
print(f"\nLooking for hint with merchant_canonical = '{canonical1}':")
hint1 = db.execute(
    text(
        """
    SELECT category_slug, confidence
    FROM merchant_category_hints
    WHERE merchant_canonical = :canonical
"""
    ),
    {"canonical": canonical1},
).fetchone()
print(f"  Result: {hint1}")

print(f"\nLooking for hint with merchant_canonical = '{canonical2}':")
hint2 = db.execute(
    text(
        """
    SELECT category_slug, confidence
    FROM merchant_category_hints
    WHERE merchant_canonical = :canonical
"""
    ),
    {"canonical": canonical2},
).fetchone()
print(f"  Result: {hint2}")

db.close()

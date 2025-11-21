from app.utils.text import canonicalize_merchant
from app.db import SessionLocal
from sqlalchemy import text

# Test canonicalization
test_cases = [
    "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON",
    "HARRIS TEETER #0085 12960 HIGHLAND CROS",
    "CapCut",
]

print("Canonicalization Results:")
for desc in test_cases:
    canonical = canonicalize_merchant(desc)
    print(f"  {desc[:50]:50} → {canonical}")

# Check if they match hints in database
print("\nHint Matching:")
db = SessionLocal()
for desc in test_cases:
    canonical = canonicalize_merchant(desc)
    result = db.execute(
        text(
            """
        SELECT category_slug, confidence
        FROM merchant_category_hints
        WHERE merchant_canonical = :canonical
    """
        ),
        {"canonical": canonical},
    ).fetchone()

    if result:
        print(f"  ✓ {canonical:30} → {result[0]:25} (conf={result[1]:.2f})")
    else:
        print(f"  ✗ {canonical:30} → NO HINT FOUND")
db.close()

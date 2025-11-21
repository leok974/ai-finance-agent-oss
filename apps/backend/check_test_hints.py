from app.db import SessionLocal
from sqlalchemy import text

db = SessionLocal()
rows = db.execute(
    text(
        """
    SELECT merchant_canonical, category_slug, source, confidence
    FROM merchant_category_hints
    WHERE merchant_canonical LIKE '%cvs%'
       OR merchant_canonical LIKE '%harris%'
       OR merchant_canonical LIKE '%capcut%'
    ORDER BY merchant_canonical
"""
    )
).fetchall()

print(f"Found {len(rows)} hints:")
for r in rows:
    print(f"{r[0]:30} → {r[1]:30} ({r[2]:15}) conf={r[3]:.2f}")
db.close()

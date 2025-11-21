from app.db import SessionLocal
from sqlalchemy import text

db = SessionLocal()
rows = db.execute(
    text(
        """
    SELECT merchant_canonical, category_slug, confidence
    FROM merchant_category_hints
    WHERE merchant_canonical LIKE '%cvs%'
       OR merchant_canonical LIKE '%harris%'
       OR merchant_canonical LIKE '%capcut%'
    ORDER BY merchant_canonical
"""
    )
).fetchall()

print("Current hints in database:")
for r in rows:
    print(f"{r[0]:40} {r[1]:30} {r[2]:.2f}")

db.close()

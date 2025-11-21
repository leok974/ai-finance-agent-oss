from app.db import SessionLocal
from app.services.categorize_suggest import suggest_categories_for_txn
from sqlalchemy import text
import os

# Disable ML feedback
os.environ["ML_FEEDBACK_SCORES_ENABLED"] = "0"

db = SessionLocal()

# Setup hints
db.execute(
    text(
        """
    DELETE FROM merchant_category_hints
    WHERE source = 'test_seed'
"""
    )
)
db.execute(
    text(
        """
    INSERT INTO merchant_category_hints
        (merchant_canonical, category_slug, source, confidence)
    VALUES
        ('cvs pharmacy', 'shopping_misc', 'test_seed', 0.86),
        ('harris teeter', 'groceries', 'test_seed', 0.99),
        ('capcut', 'subscriptions_software', 'test_seed', 0.82)
"""
    )
)
db.commit()

# Test CVS transaction
txn = {
    "merchant": "CVS",
    "description": "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON",
    "amount": -19.07,
}

print("Testing CVS transaction:")
print(f"  Merchant: {txn['merchant']}")
print(f"  Description: {txn['description']}")

results = suggest_categories_for_txn(txn, db)

print(f"\nGot {len(results)} suggestions:")
for i, r in enumerate(results, 1):
    print(f"{i}. {r['category_slug']:30} score={r['score']:.3f}  why={r['why']}")

db.close()

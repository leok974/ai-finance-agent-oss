"""
Category validation and utilities.

Matches frontend category definitions from apps/web/src/lib/categories.ts
"""

# All valid category slugs (top-level + sub-categories)
VALID_CATEGORIES = {
    # Top-level
    "income",
    "transfers",
    "housing",
    "transportation",
    "groceries",
    "restaurants",
    "coffee",
    "health",
    "medical",
    "subscriptions",
    "shopping",
    "games",
    "finance",
    "travel",
    "unknown",
    # Housing sub-categories
    "housing.utilities",
    "housing.utilities.internet",
    "housing.utilities.mobile",
    "housing.rent",
    # Transportation sub-categories
    "transportation.fuel",
    "transportation.public",
    "transportation.ride_hailing",
    "transportation.rideshare",
    # Health sub-categories
    "health.pharmacy",
    "health.insurance",
    # Subscriptions sub-categories
    "subscriptions.streaming",
    "subscriptions.software",
    "subscriptions.storage",
    "subscriptions.news",
    "subscriptions.gaming",
    # Shopping sub-categories
    "shopping.electronics",
    "shopping.clothing",
    "shopping.home",
    "shopping.misc",
    # Finance sub-categories
    "finance.fees",
    "finance.atm",
    # Travel sub-categories
    "travel.flights",
    "travel.hotels",
    # Income sub-categories
    "income.salary",
    "income.refund",
    # Utilities (standalone for backwards compat)
    "utilities",
    # Entertainment
    "entertainment",
    # Healthcare
    "healthcare",
}


def categoryExists(slug: str) -> bool:
    """Check if a category slug is valid."""
    return slug in VALID_CATEGORIES


def normalizeCategory(slug: str) -> str:
    """Normalize category slug (lowercase, trim)."""
    return slug.lower().strip()

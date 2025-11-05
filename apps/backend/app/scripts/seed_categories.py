"""Seed categories and category rules for smart categorization."""

from app.db import SessionLocal
from app.orm_models import Category, CategoryRule

CATS = [
    ("income", "Income", None),
    ("transfers", "Transfers", None),
    ("housing", "Housing", None),
    ("housing.utilities", "Utilities", "housing"),
    ("housing.utilities.internet", "Internet", "housing.utilities"),
    ("housing.utilities.mobile", "Mobile", "housing.utilities"),
    ("transportation", "Transportation", None),
    ("transportation.fuel", "Fuel", "transportation"),
    ("transportation.public", "Public Transit", "transportation"),
    ("transportation.ride_hailing", "Ride Hailing", "transportation"),
    ("groceries", "Groceries", None),
    ("restaurants", "Restaurants", None),
    ("coffee", "Coffee", None),
    ("health", "Health", None),
    ("health.pharmacy", "Pharmacy", "health"),
    ("health.insurance", "Insurance", "health"),
    ("subscriptions", "Subscriptions", None),
    ("subscriptions.streaming", "Streaming", "subscriptions"),
    ("subscriptions.software", "Software", "subscriptions"),
    ("subscriptions.storage", "Cloud Storage", "subscriptions"),
    ("subscriptions.news", "News", "subscriptions"),
    ("subscriptions.gaming", "Gaming", "subscriptions"),
    ("shopping", "Shopping", None),
    ("shopping.electronics", "Electronics", "shopping"),
    ("shopping.clothing", "Clothing", "shopping"),
    ("shopping.home", "Home Goods", "shopping"),
    ("finance", "Finance", None),
    ("finance.fees", "Fees", "finance"),
    ("finance.atm", "ATM", "finance"),
    ("travel", "Travel", None),
    ("travel.flights", "Flights", "travel"),
    ("travel.hotels", "Hotels", "travel"),
]

RULES = [
    (r"UBER|LYFT", "transportation.ride_hailing", 10),
    (r"NETFLIX|HULU|DISNEY\+|MAX|PARAMOUNT", "subscriptions.streaming", 10),
    (r"SPOTIFY|APPLE\s*MUSIC|YTMUSIC|YOUTUBE\s*PREMIUM", "subscriptions.streaming", 10),
    (r"ADOBE|MICROSOFT\s*365|OFFICE\s*365", "subscriptions.software", 20),
    (r"GOOGLE\s*ONE|DROPBOX|ICLOUD", "subscriptions.storage", 20),
    (
        r"MCDONALD|STARBUCKS|DUNKIN",
        "restaurants",
        30,
    ),  # 'coffee' can be learned via hints
    (r"SHELL|EXXON|BP|CHEVRON", "transportation.fuel", 20),
    (r"UNITED|DELTA|AMERICAN\s*AIRLINES|SOUTHWEST", "travel.flights", 20),
    (r"XFINITY|COMCAST|SPECTRUM|VERIZON|AT&T", "housing.utilities.internet", 20),
    (r"T[- ]?MOBILE", "housing.utilities.mobile", 20),
]


def main():
    db = SessionLocal()
    try:
        # categories
        for slug, label, parent in CATS:
            if not db.query(Category).filter_by(slug=slug).first():
                db.add(Category(slug=slug, label=label, parent_slug=parent))
        db.commit()

        # rules
        for pattern, cat, prio in RULES:
            if (
                not db.query(CategoryRule)
                .filter_by(pattern=pattern, category_slug=cat)
                .first()
            ):
                db.add(
                    CategoryRule(
                        pattern=pattern, category_slug=cat, priority=prio, enabled=True
                    )
                )
        db.commit()
        print("[seed] categories & rules ok")
    finally:
        db.close()


if __name__ == "__main__":
    main()

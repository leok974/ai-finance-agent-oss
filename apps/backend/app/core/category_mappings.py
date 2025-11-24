"""
Category label to slug mappings for CSV ingestion.

Maps human-readable category labels (from CSV files) to internal category slugs
used throughout the application.
"""

# Map CSV category labels to internal slugs
CATEGORY_LABEL_TO_SLUG = {
    # Demo CSV categories (generate_demo_csv.py) - dot notation (PRIORITY - used in sample data)
    "income.salary": "income.salary",
    "income.freelance": "income.freelance",
    "income.other": "income.other",
    "groceries": "groceries",
    "restaurants": "restaurants",
    "fuel": "transportation.fuel",
    "utilities.mobile": "housing.utilities.mobile",
    "utilities.internet": "housing.utilities.internet",
    "shopping.online": "shopping.online",
    "shopping.retail": "shopping.retail",
    "entertainment.games": "games",
    "transportation.rideshare": "transportation.ride_hailing",
    "subscriptions.entertainment": "subscriptions.streaming",
    "subscriptions.software": "subscriptions.software",
    "health.insurance": "health.insurance",
    "health.medical": "health.medical",
    "transfers": "transfers",
    # Demo CSV categories (legacy underscore format)
    "income_salary": "income.salary",
    "income_other": "income.other",
    "rent": "housing.rent",
    "subscriptions_media": "subscriptions.streaming",
    "entertainment_games": "games",
    # Your CSV categories → LedgerMind internal slugs
    "restaurant": "restaurants",
    "restaurant_delivery": "restaurants",
    "subscriptions_digital": "subscriptions.streaming",
    "subscriptions_professional": "subscriptions",
    "utilities_gas": "housing.utilities",
    "shopping_online": "shopping",
    "credit_card_payment": "finance",
    "games": "games",
    "transfer_p2p": "transfers",
    # Additional common mappings
    "utilities": "housing.utilities",
    "utilities_mobile": "housing.utilities.mobile",
    "transportation": "transportation",
    "ride_hailing": "transportation.ride_hailing",
    "coffee": "coffee",
    "health": "health",
    "pharmacy": "health.pharmacy",
    "medical": "medical",
    "subscriptions": "subscriptions",
    "streaming": "subscriptions.streaming",
    "software": "subscriptions.software",
    "shopping": "shopping",
    "electronics": "shopping.electronics",
    "clothing": "shopping.clothing",
    "travel": "travel",
    "flights": "travel.flights",
    "hotels": "travel.hotels",
    "income": "income",
    "salary": "income",
    # Legacy mappings (if your old CSVs use these)
    "Groceries": "groceries",
    "Restaurants": "restaurants",
    "Fuel": "transportation.fuel",
    "Rent": "housing",
    "Subscriptions": "subscriptions",
    "Health": "health",
    "Healthcare": "health",
    "Entertainment": "games",
    "Shopping": "shopping",
    "Income": "income",
}


def normalize_category(raw_category: str | None) -> str | None:
    """
    Convert a raw category label to internal slug.

    Args:
        raw_category: Category label from CSV or user input

    Returns:
        Internal category slug, or None if unmapped
    """
    if not raw_category:
        return None

    # Normalize: strip, lowercase, replace spaces with underscores
    normalized = raw_category.strip().lower().replace(" ", "_")

    # Try exact match first
    if normalized in CATEGORY_LABEL_TO_SLUG:
        return CATEGORY_LABEL_TO_SLUG[normalized]

    # Try without normalization (e.g., "Groceries" → "groceries")
    if raw_category.strip() in CATEGORY_LABEL_TO_SLUG:
        return CATEGORY_LABEL_TO_SLUG[raw_category.strip()]

    # No mapping found
    return None

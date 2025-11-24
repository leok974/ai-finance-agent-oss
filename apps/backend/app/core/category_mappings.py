"""
Category label to slug mappings for CSV ingestion.

Maps human-readable category labels (from CSV files) to internal category slugs
used throughout the application.
"""

# Map CSV category labels to internal slugs
CATEGORY_LABEL_TO_SLUG = {
    # Your CSV categories → LedgerMind internal slugs
    "groceries": "groceries",
    "restaurant": "restaurants",
    "restaurant_delivery": "restaurants",
    "subscriptions_digital": "subscriptions.streaming",
    "subscriptions_software": "subscriptions.software",
    "subscriptions_professional": "subscriptions",
    "utilities_gas": "housing.utilities",
    "utilities_internet": "housing.utilities.internet",
    "shopping_online": "shopping",
    "credit_card_payment": "finance",
    "games": "games",
    "transfer_p2p": "transfers",
    # Additional common mappings
    "utilities": "housing.utilities",
    "utilities_mobile": "housing.utilities.mobile",
    "transportation": "transportation",
    "fuel": "transportation.fuel",
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
    "transfers": "transfers",
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

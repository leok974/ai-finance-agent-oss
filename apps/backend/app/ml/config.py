# apps/backend/app/ml/config.py

"""ML configuration - canonical category labels and feature definitions.

This module defines:
1. CATEGORY_LABELS - Canonical list of all known categories for ML training
2. Label-to-ID mappings for encoding
3. Feature column definitions
4. P2P detection patterns
"""

from __future__ import annotations
import re

# Canonical category labels for ML training
# These must match the category slugs used in the database and frontend
CATEGORY_LABELS = [
    "income",
    "transfers",  # Includes P2P (Zelle, Venmo, Cash App, PayPal, Apple Cash)
    "groceries",
    "restaurants",
    "coffee",
    "transportation",
    "transportation.fuel",
    "transportation.public",
    "transportation.ride_hailing",
    "housing",
    "housing.utilities",
    "housing.utilities.internet",
    "housing.utilities.mobile",
    "health",
    "health.pharmacy",
    "health.insurance",
    "subscriptions",
    "subscriptions.streaming",
    "subscriptions.software",
    "subscriptions.storage",
    "subscriptions.news",
    "subscriptions.gaming",
    "shopping",
    "shopping.electronics",
    "shopping.clothing",
    "shopping.home",
    "finance",
    "finance.fees",
    "finance.atm",
    "travel",
    "travel.flights",
    "travel.hotels",
]

# Label-to-ID mapping for encoding (alphabetically sorted for stability)
CATEGORY_LABELS_SORTED = sorted(CATEGORY_LABELS)
LABEL_TO_ID = {name: i for i, name in enumerate(CATEGORY_LABELS_SORTED)}
ID_TO_LABEL = {i: name for name, i in LABEL_TO_ID.items()}

# P2P detection patterns (synced with merchant_normalizer.py)
P2P_PATTERNS = [
    re.compile(r"\bvenmo\b", re.I),
    re.compile(r"\b(now\s+withdrawal|zelle)\b", re.I),
    re.compile(r"\b(sq\s*\*|sqc\*|cash\s*app)\b", re.I),
    re.compile(r"\bpaypal\b(?!.*(netflix|spotify|amazon|adobe|microsoft|apple))", re.I),
    re.compile(r"\bapple\s*cash\b", re.I),
]


def is_p2p_transaction(text: str) -> bool:
    """Check if transaction text contains P2P patterns.

    Args:
        text: Merchant name or description

    Returns:
        True if any P2P pattern matches
    """
    if not text:
        return False
    for pat in P2P_PATTERNS:
        if pat.search(text):
            return True
    return False


# Feature columns for ML model (must match ml_features table)
TEXT_FEATURES = ["norm_desc"]  # TF-IDF hashed
CATEGORICAL_FEATURES = ["merchant", "channel", "mcc"]  # One-hot encoded
NUMERICAL_FEATURES = [
    "abs_amount",
    "hour_of_day",
    "dow",
    "is_weekend",
    "is_subscription",
]

# P2P-specific features (added for Transfers / P2P category)
P2P_FEATURES = [
    "feat_p2p_flag",  # Binary: 1 if P2P pattern detected
    "feat_p2p_large_outflow",  # Binary: 1 if P2P + large outflow (>=$100)
]

# All numerical features (base + P2P)
ALL_NUMERICAL_FEATURES = NUMERICAL_FEATURES + P2P_FEATURES

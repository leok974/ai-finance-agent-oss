"""Feature extraction for ML suggestions.

This module extracts features from transactions for model inference.
Features must match the training schema exactly.
"""

from __future__ import annotations
import re


def extract_features(txn: dict) -> dict:
    """Extract features from transaction for model inference.

    Args:
        txn: Transaction dict with merchant, memo, amount, etc.

    Returns:
        Feature dict matching training schema
    """
    merchant = (txn.get("merchant") or "").lower()
    memo = (txn.get("memo") or txn.get("description") or "").lower()
    amt = float(txn.get("amount") or 0.0)

    feats = {
        # Numeric features
        "amount": amt,
        "amount_abs": abs(amt),
        "is_negative": float(amt < 0),
        "is_positive": float(amt > 0),
        # Text length features
        "merchant_len": len(merchant),
        "memo_len": len(memo),
        # Keyword features (merchants)
        "has_amazon": float("amazon" in merchant or "amazon" in memo),
        "has_uber": float("uber" in merchant or "uber" in memo),
        "has_lyft": float("lyft" in merchant or "lyft" in memo),
        "has_zelle": float("zelle" in merchant or "zelle" in memo),
        "has_venmo": float("venmo" in merchant or "venmo" in memo),
        "has_costco": float("costco" in merchant or "costco" in memo),
        "has_target": float("target" in merchant or "target" in memo),
        "has_walmart": float("walmart" in merchant or "walmart" in memo),
        "has_whole_foods": float("whole foods" in merchant or "whole foods" in memo),
        "has_netflix": float("netflix" in merchant or "netflix" in memo),
        "has_spotify": float("spotify" in merchant or "spotify" in memo),
        # Keyword features (categories from memo)
        "has_rent": float(re.search(r"\brent\b", memo) is not None),
        "has_coffee": float(re.search(r"\bcoffee\b", memo) is not None),
        "has_lunch": float(re.search(r"\blunch\b", memo) is not None),
        "has_dinner": float(re.search(r"\bdinner\b", memo) is not None),
        "has_gas": float(re.search(r"\bgas\b", memo) is not None),
        "has_pharmacy": float(re.search(r"\bpharmacy|drug\b", memo) is not None),
        "has_gym": float(re.search(r"\bgym|fitness\b", memo) is not None),
        "has_grocery": float(re.search(r"\bgrocery|groceries\b", memo) is not None),
    }

    return feats


# Feature names in order (must match training exactly)
FEATURE_NAMES = [
    "amount",
    "amount_abs",
    "is_negative",
    "is_positive",
    "merchant_len",
    "memo_len",
    "has_amazon",
    "has_uber",
    "has_lyft",
    "has_zelle",
    "has_venmo",
    "has_costco",
    "has_target",
    "has_walmart",
    "has_whole_foods",
    "has_netflix",
    "has_spotify",
    "has_rent",
    "has_coffee",
    "has_lunch",
    "has_dinner",
    "has_gas",
    "has_pharmacy",
    "has_gym",
    "has_grocery",
]

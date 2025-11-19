"""
Merchant Memory Cache using Redis.

Provides fast lookup and learning for merchant categorization and display names.
Layers on top of existing DB + LLM logic.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.services.charts_data import canonical_and_label


# --- Redis key generation -----------------------------------------------------


def merchant_redis_key(raw_merchant: str) -> str:
    """
    Generate stable Redis key for a merchant based on normalized name.
    Uses SHA1 hash to keep keys fixed-length and safe.
    """
    key, _ = canonical_and_label(raw_merchant)
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    return f"merchant:v1:{digest}"


# --- Merchant hint data structure ---------------------------------------------


class MerchantHint:
    """Merchant hint stored in Redis cache."""

    def __init__(
        self,
        normalized_name: str,
        display_name: str,
        category: Optional[str] = None,
        subcategories: Optional[list[str]] = None,
        confidence: float = 0.0,
        source: str = "heuristic",
        canonical_id: Optional[str] = None,
        first_seen: Optional[str] = None,
        last_seen: Optional[str] = None,
        seen_count: int = 1,
        raw_examples: Optional[list[str]] = None,
    ):
        self.normalized_name = normalized_name
        self.display_name = display_name
        self.category = category
        self.subcategories = subcategories or []
        self.confidence = confidence
        self.source = source
        self.canonical_id = canonical_id
        self.first_seen = first_seen or datetime.now(timezone.utc).isoformat()
        self.last_seen = last_seen or datetime.now(timezone.utc).isoformat()
        self.seen_count = seen_count
        self.raw_examples = raw_examples or []

    def to_dict(self) -> Dict[str, Any]:
        """Convert to Redis-storable dict."""
        return {
            "normalized_name": self.normalized_name,
            "display_name": self.display_name,
            "category": self.category,
            "subcategories": self.subcategories,
            "confidence": self.confidence,
            "source": self.source,
            "canonical_id": self.canonical_id,
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
            "seen_count": self.seen_count,
            "raw_examples": self.raw_examples[:5],  # Keep only 5 examples
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> MerchantHint:
        """Load from Redis dict."""
        return cls(
            normalized_name=data.get("normalized_name", ""),
            display_name=data.get("display_name", ""),
            category=data.get("category"),
            subcategories=data.get("subcategories", []),
            confidence=data.get("confidence", 0.0),
            source=data.get("source", "heuristic"),
            canonical_id=data.get("canonical_id"),
            first_seen=data.get("first_seen"),
            last_seen=data.get("last_seen"),
            seen_count=data.get("seen_count", 1),
            raw_examples=data.get("raw_examples", []),
        )


# --- Cache operations ---------------------------------------------------------


def lookup_merchant_hint(redis_client, raw_merchant: str) -> Optional[MerchantHint]:
    """
    Fast Redis lookup for merchant hints.
    Returns cached hint if available, None otherwise.
    """
    if not redis_client:
        return None

    redis_key = merchant_redis_key(raw_merchant)
    try:
        payload = redis_client.get(redis_key)
        if not payload:
            return None

        data = json.loads(payload)
        return MerchantHint.from_dict(data)
    except Exception:
        # Redis errors shouldn't break the app
        return None


def store_merchant_hint(
    redis_client, raw_merchant: str, hint: MerchantHint, ttl_seconds: int = 2592000
) -> None:
    """
    Store merchant hint in Redis.
    Default TTL: 30 days (2592000 seconds).
    """
    if not redis_client:
        return

    redis_key = merchant_redis_key(raw_merchant)
    try:
        payload = json.dumps(hint.to_dict())
        redis_client.setex(redis_key, ttl_seconds, payload)
    except Exception:
        # Redis errors shouldn't break the app
        pass


def update_merchant_seen(
    redis_client, raw_merchant: str, new_example: Optional[str] = None
) -> None:
    """
    Bump last_seen and seen_count for an existing merchant hint.
    Optionally add a new raw example.
    """
    if not redis_client:
        return

    hint = lookup_merchant_hint(redis_client, raw_merchant)
    if not hint:
        return

    hint.last_seen = datetime.now(timezone.utc).isoformat()
    hint.seen_count += 1

    if new_example and new_example not in hint.raw_examples:
        hint.raw_examples.append(new_example)
        hint.raw_examples = hint.raw_examples[:5]  # Keep only 5 examples

    store_merchant_hint(redis_client, raw_merchant, hint)


# --- Learning pipeline --------------------------------------------------------


def learn_merchant(
    redis_client,
    db: Session,
    raw_merchant: str,
    description: Optional[str] = None,
    amount: Optional[float] = None,
    mcc: Optional[str] = None,
) -> MerchantHint:
    """
    Learning pipeline for unknown merchants.

    Flow:
    1. Check Redis cache (fast path)
    2. Check DB for existing hints
    3. Use heuristics or LLM to infer category
    4. Store in Redis + enqueue DB write

    Returns merchant hint (always succeeds with fallback).
    """
    # 1. Check Redis first
    cached = lookup_merchant_hint(redis_client, raw_merchant)
    if cached:
        # Update seen stats asynchronously
        update_merchant_seen(redis_client, raw_merchant, raw_merchant)
        return cached

    # 2. Compute normalized key and label
    canonical_key, display_label = canonical_and_label(raw_merchant)

    # 3. Check DB for existing merchant_hints
    # TODO: Query merchant_hints table when available
    # For now, use heuristics

    # 4. Use heuristics to infer category
    # TODO: Replace with LLM call for better accuracy
    category, subcategories, confidence = _infer_category_heuristic(
        raw_merchant, description, amount, mcc
    )

    # 5. Create hint
    hint = MerchantHint(
        normalized_name=canonical_key,
        display_name=display_label,
        category=category,
        subcategories=subcategories,
        confidence=confidence,
        source="heuristic",  # or "llm" when implemented
        first_seen=datetime.now(timezone.utc).isoformat(),
        last_seen=datetime.now(timezone.utc).isoformat(),
        seen_count=1,
        raw_examples=[raw_merchant],
    )

    # 6. Store in Redis
    store_merchant_hint(redis_client, raw_merchant, hint)

    # 7. TODO: Enqueue background job to persist to DB

    return hint


def _infer_category_heuristic(
    raw_merchant: str,
    description: Optional[str],
    amount: Optional[float],
    mcc: Optional[str],
) -> tuple[Optional[str], list[str], float]:
    """
    Simple heuristic-based category inference.
    Replace with LLM call for production.
    """
    text = (raw_merchant or "").lower()

    # Subscription patterns
    if any(
        kw in text
        for kw in [
            "netflix",
            "spotify",
            "hulu",
            "disney",
            "amazon prime",
            "playstation",
            "xbox",
        ]
    ):
        return "Subscriptions", ["Entertainment", "Streaming"], 0.85

    # Grocery patterns
    if any(
        kw in text
        for kw in ["teeter", "kroger", "whole foods", "trader joe", "safeway"]
    ):
        return "Groceries", ["Food & Dining"], 0.80

    # Restaurant patterns
    if any(
        kw in text for kw in ["restaurant", "cafe", "coffee", "starbucks", "mcdonald"]
    ):
        return "Dining", ["Food & Dining", "Restaurants"], 0.75

    # Gas station patterns
    if any(kw in text for kw in ["shell", "chevron", "bp", "exxon", "gas"]):
        return "Transportation", ["Gas & Fuel"], 0.75

    # Default: unknown with low confidence
    return None, [], 0.3


# --- Utility functions --------------------------------------------------------


def get_merchant_display_info(
    redis_client, db: Session, raw_merchant: str
) -> Dict[str, Any]:
    """
    Get display information for a merchant.
    Used by charts, suggestions, and UI components.

    Returns dict with:
    - normalized_name: str
    - display_name: str
    - category: str | None
    - confidence: float
    """
    hint = learn_merchant(redis_client, db, raw_merchant)

    return {
        "normalized_name": hint.normalized_name,
        "display_name": hint.display_name,
        "category": hint.category,
        "subcategories": hint.subcategories,
        "confidence": hint.confidence,
    }

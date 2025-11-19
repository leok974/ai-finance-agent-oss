# apps/backend/app/services/merchant_normalizer.py

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, Literal, TYPE_CHECKING

if TYPE_CHECKING:
    from redis.asyncio import Redis

MerchantKind = Literal["p2p", "subscription", "retail", "atm", "cash", "other"]
MerchantCategoryHint = Literal[
    "transfers",
    "subscriptions",
    "groceries",
    "fuel",
    "dining",
    "atm",
    "cash",
    "other",
    "unknown",
]


@dataclass
class NormalizedMerchant:
    display: str
    kind: Optional[MerchantKind] = None
    category_hint: Optional[MerchantCategoryHint] = None
    rule_id: Optional[str] = None  # for debugging


@dataclass
class MerchantBrandRule:
    id: str
    pattern: re.Pattern
    normalized: str
    kind: Optional[MerchantKind] = None
    category_hint: Optional[MerchantCategoryHint] = None


BRAND_RULES: list[MerchantBrandRule] = [
    MerchantBrandRule(
        id="zelle_now_withdrawal",
        pattern=re.compile(
            r"\b(now\s+withdrawal|zelle(?:\s+(payment|transfer))?)\b", re.I
        ),
        normalized="Zelle transfer",
        kind="p2p",
        category_hint="transfers",
    ),
    MerchantBrandRule(
        id="venmo",
        pattern=re.compile(r"\bvenmo\b", re.I),
        normalized="Venmo",
        kind="p2p",
        category_hint="transfers",
    ),
    MerchantBrandRule(
        id="cash_app",
        pattern=re.compile(r"\b(sq\s*\*|sqc\*|cash\s*app)\b", re.I),
        normalized="Cash App",
        kind="p2p",
        category_hint="transfers",
    ),
    MerchantBrandRule(
        id="paypal_p2p",
        pattern=re.compile(
            r"\bpaypal\b(?!.*\b(netflix|spotify|amazon|adobe|microsoft|apple)\b)", re.I
        ),
        normalized="PayPal",
        kind="p2p",
        category_hint="transfers",
    ),
    MerchantBrandRule(
        id="apple_cash",
        pattern=re.compile(r"\bapple\s*cash\b", re.I),
        normalized="Apple Cash",
        kind="p2p",
        category_hint="transfers",
    ),
]


def _basic_normalize(raw: str) -> str:
    if not raw:
        return "Unknown"

    s = raw.strip()

    # Simplify separators
    s = re.sub(r"[*_]+", " ", s)
    s = re.sub(r"\s{2,}", " ", s)

    # Drop long numeric / phone-like tails
    s = re.sub(
        r"\s+(x?\d{4,}|\d{3}-\d{3,}-\d{3,}|\d{10,}|[0-9]{4,}[A-Z0-9-]*)\s*$",
        "",
        s,
        flags=re.I,
    ).strip()

    if not s:
        return "Unknown"

    parts = s.lower().split()
    return " ".join(p.capitalize() for p in parts)


def normalize_merchant_for_category(raw: str) -> NormalizedMerchant:
    """
    Normalize a raw merchant/description string into structured data.

    This is the synchronous baseline normalizer. For async request handlers,
    prefer normalize_merchant_with_memory() which checks Redis first.

    Returns:
        NormalizedMerchant with display name, kind, and category hint
    """
    if not raw:
        return NormalizedMerchant(display="Unknown", category_hint="unknown")

    for rule in BRAND_RULES:
        if rule.pattern.search(raw):
            return NormalizedMerchant(
                display=rule.normalized,
                kind=rule.kind,
                category_hint=rule.category_hint or "other",
                rule_id=rule.id,
            )

    return NormalizedMerchant(
        display=_basic_normalize(raw),
        category_hint="unknown",
    )


async def normalize_merchant_with_memory(
    raw: Optional[str],
    redis: Optional[Redis] = None,
) -> NormalizedMerchant:
    """
    Preferred entrypoint for async request handlers.

    Strategy:
    1. Try Redis memory (user / ML / rule decisions from past 30 days)
    2. Fall back to regex + heuristics
    3. Store result back to Redis with 30d TTL

    This ensures consistency: once we've seen "NOW Withdrawal Zelle...",
    we always normalize it the same way without re-running regex.

    Args:
        raw: Raw merchant/description string from bank statement
        redis: Redis connection (optional, degrades gracefully if None)

    Returns:
        NormalizedMerchant with display name, kind, and category hint
    """
    if raw is None:
        return normalize_merchant_for_category("")

    raw_str = raw.strip()
    if not raw_str:
        return normalize_merchant_for_category("")

    # Try Redis memory first
    if redis is not None:
        try:
            from app.services.merchant_memory import (
                get_merchant_memory,
                put_merchant_memory,
            )

            mem = await get_merchant_memory(redis, raw_str)
            if mem is not None:
                return NormalizedMerchant(
                    display=mem.canonical,
                    kind=mem.kind,  # type: ignore
                    category_hint=mem.category_hint,  # type: ignore
                    rule_id=None,
                )
        except Exception:
            # Redis down → continue with heuristics
            pass

    # Fallback to synchronous normalizer
    norm = normalize_merchant_for_category(raw_str)

    # Store in Redis for future lookups
    if redis is not None:
        try:
            from app.services.merchant_memory import put_merchant_memory

            # Confidence 0.9 for rules, 0.7 for generic heuristic
            confidence = 0.9 if norm.rule_id else 0.7
            source = "rule" if norm.rule_id else "heuristic"
            await put_merchant_memory(
                redis, raw_str, norm, confidence=confidence, source=source
            )
        except Exception:
            # Redis unavailable → log but don't fail
            pass

    return norm

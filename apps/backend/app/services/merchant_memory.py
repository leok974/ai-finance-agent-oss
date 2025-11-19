from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Optional

from redis.asyncio import Redis

from app.services.merchant_normalizer import (
    NormalizedMerchant,
)

MERCHANT_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days


@dataclass
class MerchantMemory:
    raw: str
    canonical: str
    kind: Optional[str]
    category_hint: Optional[str]
    confidence: float
    source: str  # "rule" | "ml" | "user" | "heuristic"
    last_seen: str  # ISO 8601


def _key(raw: str) -> str:
    """Generate Redis key for merchant memory with stable normalization."""
    # Lowercase / trim for stable key
    return f"merchant:memory:{raw.strip().lower()}"


async def get_merchant_memory(redis: Redis, raw: str) -> Optional[MerchantMemory]:
    """
    Retrieve merchant memory from Redis cache.

    Returns None if not found or if Redis is unavailable.
    """
    if not raw:
        return None

    try:
        data = await redis.hgetall(_key(raw))
        if not data:
            return None

        # redis-py returns bytes; decode
        def _get(name: str) -> Optional[str]:
            v = data.get(name.encode())
            return v.decode() if v is not None else None

        return MerchantMemory(
            raw=_get("raw") or raw,
            canonical=_get("canonical") or raw,
            kind=_get("kind"),
            category_hint=_get("category_hint"),
            confidence=float(_get("confidence") or 0.7),
            source=_get("source") or "heuristic",
            last_seen=_get("last_seen") or datetime.now(timezone.utc).isoformat(),
        )
    except Exception:
        # Redis down / connection error → graceful degradation
        return None


async def put_merchant_memory(
    redis: Redis,
    raw: str,
    normalized: NormalizedMerchant,
    *,
    confidence: float = 0.8,
    source: str = "rule",
) -> MerchantMemory:
    """
    Store merchant normalization decision in Redis with 30-day TTL.

    This creates a memory of how we categorized this merchant so future
    encounters are consistent and don't require re-running heuristics.
    """
    now = datetime.now(timezone.utc).isoformat()
    mem = MerchantMemory(
        raw=raw,
        canonical=normalized.display,
        kind=normalized.kind,
        category_hint=normalized.category_hint,
        confidence=confidence,
        source=source,
        last_seen=now,
    )

    try:
        key = _key(raw)
        # Convert dataclass to dict, then to string values for Redis
        mapping = {k: str(v) if v is not None else "" for k, v in asdict(mem).items()}
        await redis.hset(key, mapping=mapping)
        await redis.expire(key, MERCHANT_TTL_SECONDS)
    except Exception:
        # Redis unavailable → log but don't fail the request
        pass

    return mem

"""Redis-backed replay cache for HMAC request deduplication.

Provides distributed replay protection across multiple backend workers.
Falls back to in-memory cache if Redis unavailable (development mode).
"""

from __future__ import annotations

import logging
from typing import Protocol

logger = logging.getLogger(__name__)


class ReplayCacheProtocol(Protocol):
    """Abstract interface for replay caches."""

    def check_and_set(self, key: str, ttl_seconds: int) -> bool:
        """Store replay key with TTL. Returns False if key already exists."""
        ...


class InMemoryReplayCache:
    """In-memory replay cache (fallback mode, single-worker only)."""

    def __init__(self) -> None:
        self._cache: dict[str, float] = {}
        self._max_entries = 10_000

    def check_and_set(self, key: str, ttl_seconds: int) -> bool:
        """Check if key exists, set if not. Returns True if new entry."""
        import time

        now = time.time()

        # Cleanup expired entries periodically
        if len(self._cache) > self._max_entries:
            self._cache = {k: v for k, v in self._cache.items() if v > now}

        # Check if key exists and not expired
        if key in self._cache and self._cache[key] > now:
            return False

        # Set with expiration timestamp
        self._cache[key] = now + ttl_seconds
        return True


class RedisReplayCache:
    """Redis-backed replay cache (multi-worker safe)."""

    def __init__(self, redis_url: str, key_prefix: str = "hmac:replay:") -> None:
        import redis

        self._prefix = key_prefix
        self._pool = redis.ConnectionPool.from_url(
            redis_url, decode_responses=True, socket_connect_timeout=2, socket_timeout=2
        )
        self._client = redis.Redis(connection_pool=self._pool)

        # Test connection
        try:
            self._client.ping()
            logger.info(f"Redis replay cache connected: {redis_url}")
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")
            raise

    def check_and_set(self, key: str, ttl_seconds: int) -> bool:
        """Atomically check and set key. Returns True if new entry (SET NX)."""
        full_key = f"{self._prefix}{key}"
        try:
            # SET with NX (only if not exists) and EX (TTL)
            result = self._client.set(full_key, "1", nx=True, ex=ttl_seconds)
            return bool(result)  # True if set, False if already exists
        except Exception as e:
            logger.error(f"Redis SET failed for {key}: {e}")
            # On Redis error, deny request (fail-secure)
            return False


def create_replay_cache(redis_url: str | None, key_prefix: str) -> ReplayCacheProtocol:
    """Factory: create Redis cache if URL provided, else in-memory fallback."""
    if redis_url and redis_url != "disabled":
        try:
            return RedisReplayCache(redis_url, key_prefix)
        except Exception as e:
            logger.warning(f"Redis unavailable, using in-memory cache: {e}")
            return InMemoryReplayCache()
    else:
        logger.info("Redis disabled, using in-memory replay cache")
        return InMemoryReplayCache()

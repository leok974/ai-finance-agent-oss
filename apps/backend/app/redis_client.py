"""
Redis connection and utilities.
"""

from typing import Optional
import os


def get_redis_client():
    """
    Get Redis client instance.
    Returns None if Redis is not configured or unavailable.
    """
    try:
        import redis

        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        client = redis.from_url(redis_url, decode_responses=True)

        # Test connection
        client.ping()
        return client
    except Exception:
        # Redis not available - graceful degradation
        return None


# Global Redis client (lazy-initialized)
_redis_client: Optional[any] = None


def redis() -> Optional[any]:
    """
    Get global Redis client instance.
    Returns None if Redis is not available (graceful degradation).
    """
    global _redis_client
    if _redis_client is None:
        _redis_client = get_redis_client()
    return _redis_client

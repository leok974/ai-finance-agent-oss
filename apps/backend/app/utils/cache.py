"""
Caching utility with Redis fallback to in-memory TTL cache.

Supports both Redis (if REDIS_URL is set) and a simple thread-safe
in-process LRU cache with TTL expiration.
"""
import os
import json
import time
import threading
from typing import Any, Optional

# Import metrics if available
try:
    from app.metrics_ml import lm_help_cache_keys
    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False

_REDIS_URL = os.getenv("REDIS_URL")
_TTL = int(os.getenv("HELP_CACHE_TTL_SEC", "600"))

_redis = None
if _REDIS_URL:
    try:
        import redis  # type: ignore
        _redis = redis.Redis.from_url(_REDIS_URL, decode_responses=True)
    except Exception:
        _redis = None

# Simple in-proc TTL cache as fallback
_store = {}
_lock = threading.Lock()


def _now() -> float:
    """Current timestamp in seconds."""
    return time.time()


def cache_get(key: str) -> Optional[Any]:
    """
    Retrieve cached value by key.
    
    Returns None if key not found or expired.
    """
    if _redis:
        try:
            v = _redis.get(key)
            return json.loads(v) if v else None
        except Exception:
            # Redis error, fall through to in-memory
            pass
    
    # In-memory fallback
    with _lock:
        item = _store.get(key)
        if not item:
            return None
        val, exp = item
        if _now() > exp:
            _store.pop(key, None)
            return None
        return val


def cache_set(key: str, value: Any, ttl: Optional[int] = None):
    """
    Store value in cache with TTL.
    
    Args:
        key: Cache key
        value: Value to cache (must be JSON-serializable)
        ttl: Time-to-live in seconds (defaults to HELP_CACHE_TTL_SEC)
    """
    ttl = ttl or _TTL
    
    if _redis:
        try:
            _redis.setex(key, ttl, json.dumps(value))
            _update_cache_gauge()
            return
        except Exception:
            # Redis error, fall through to in-memory
            pass
    
    # In-memory fallback
    with _lock:
        _store[key] = (value, _now() + ttl)
        _update_cache_gauge()


def cache_clear(prefix: Optional[str] = None):
    """
    Clear cached entries.
    
    Args:
        prefix: If provided, only clear keys matching this prefix (e.g., "help:")
                If None, clears all cache entries
    """
    if _redis:
        try:
            if prefix:
                # Delete keys matching prefix
                pattern = f"{prefix}*"
                keys = _redis.keys(pattern)
                if keys:
                    _redis.delete(*keys)
            else:
                _redis.flushdb()
            _update_cache_gauge()
        except Exception:
            pass
    
    with _lock:
        if prefix:
            # Remove keys matching prefix
            keys_to_remove = [k for k in _store.keys() if k.startswith(prefix)]
            for k in keys_to_remove:
                _store.pop(k, None)
        else:
            _store.clear()
        _update_cache_gauge()


def _update_cache_gauge():
    """Update the cache keys gauge metric."""
    if not METRICS_AVAILABLE:
        return
    
    try:
        if _redis:
            # Count help:* keys in Redis
            count = len(_redis.keys("help:*"))
            lm_help_cache_keys.set(count)
        else:
            # Count help:* keys in-memory
            with _lock:
                count = sum(1 for k in _store.keys() if k.startswith("help:"))
            lm_help_cache_keys.set(count)
    except Exception:
        # Don't fail cache operations due to metrics errors
        pass

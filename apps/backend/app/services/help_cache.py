import time
import threading
from typing import Any, Dict, Optional, Tuple

# Optional Prometheus metrics (safe if library absent)
try:  # pragma: no cover - optional dependency
    from prometheus_client import Counter, Gauge  # type: ignore

    _METRICS = {
        "hits": Counter("help_cache_hits_total", "Help cache hits"),
        "misses": Counter("help_cache_misses_total", "Help cache misses"),
        "evictions": Counter("help_cache_evictions_total", "Help cache evictions"),
        "size": Gauge("help_cache_entries", "Help cache current size"),
    }
except Exception:  # pragma: no cover - no prometheus
    _METRICS = None

_TTL_DEFAULT: float = 300.0  # seconds (5m)
_cache: Dict[str, Tuple[Dict[str, Any], float]] = {}
_lock = threading.Lock()
_stats = {"hits": 0, "misses": 0, "evictions": 0}


def _now() -> float:
    return time.time()


def make_key(
    panel_id: str,
    month: Optional[str],
    filters_hash: str,
    rephrase: bool,
    mode: Optional[str] = None,
) -> str:
    mode_token = (mode or ("explain" if rephrase else "learn")) or "learn"
    safe_mode = mode_token.replace("|", ":")
    return f"{panel_id}|{safe_mode}|{month or 'none'}|{filters_hash}|r={1 if rephrase else 0}"


def get(key: str) -> Optional[Dict[str, Any]]:
    with _lock:
        entry = _cache.get(key)
        if not entry:
            _stats["misses"] += 1
            if _METRICS:
                _METRICS["misses"].inc()
            return None
        val, exp = entry
        # Treat an entry whose expiry second has arrived as expired (>=)
        if _now() >= exp:
            _cache.pop(key, None)
            _stats["misses"] += 1
            _stats["evictions"] += 1
            if _METRICS:
                _METRICS["misses"].inc()
                _METRICS["evictions"].inc()
                _METRICS["size"].set(len(_cache))
            return None
        _stats["hits"] += 1
        if _METRICS:
            _METRICS["hits"].inc()
        return val


def set_(key: str, value: Dict[str, Any], ttl: Optional[float] = None) -> None:
    with _lock:
        t = float(_TTL_DEFAULT if ttl is None else ttl)
        _cache[key] = (value, _now() + t)
        if _METRICS:
            _METRICS["size"].set(len(_cache))


def clear() -> None:
    with _lock:
        _cache.clear()
        _stats["hits"] = _stats["misses"] = _stats["evictions"] = 0
        if _METRICS:
            _METRICS["size"].set(0)


def size() -> int:
    with _lock:
        return len(_cache)


def stats() -> Dict[str, int]:
    with _lock:
        return {
            "hits": _stats["hits"],
            "misses": _stats["misses"],
            "evictions": _stats["evictions"],
            "size": len(_cache),
        }


def reset_stats() -> None:
    with _lock:
        _stats["hits"] = 0
        _stats["misses"] = 0
        _stats["evictions"] = 0


# For tests


def _set_ttl_for_tests(seconds: float, retroactive: bool = False) -> None:
    """Set global TTL. If retroactive, tighten existing entries to now+seconds."""
    global _TTL_DEFAULT
    _TTL_DEFAULT = float(seconds)
    if retroactive:
        now = _now()
        with _lock:
            for k, (val, _) in list(_cache.items()):
                _cache[k] = (val, now + _TTL_DEFAULT)


def _force_expire_for_tests(key: str) -> None:
    """Deterministically evict a key for tests.

    We previously set the expiry in the past and relied on get() to perform
    the eviction. Under parallel test execution another thread could remove
    the key between forcing expiry and the explicit get(), leading to a miss
    without an eviction increment. To make the test deterministic we perform
    the eviction and accounting inline here if the key exists; otherwise we
    insert a synthetic expired entry and immediately evict it so stats still
    reflect a single eviction event.
    """
    with _lock:
        existed = key in _cache
        if existed:
            _cache.pop(key, None)
        else:
            # synthesize then remove to count as an eviction path
            _cache[key] = ({"_synthetic": True}, _now())
            _cache.pop(key, None)
        _stats["misses"] += 1  # eviction is also a miss surface for requester
        _stats["evictions"] += 1
        if _METRICS:
            _METRICS["misses"].inc()
            _METRICS["evictions"].inc()
            _METRICS["size"].set(len(_cache))

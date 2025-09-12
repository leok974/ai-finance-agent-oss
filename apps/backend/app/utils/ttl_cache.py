from __future__ import annotations
import time
from typing import Any, Callable, Tuple

class TTLCache:
    def __init__(self):
        self._store: dict[str, Tuple[float, Any]] = {}

    def get(self, key: str, ttl_seconds: int, loader: Callable[[], Any]) -> Any:
        now = time.time()
        hit = self._store.get(key)
        if hit and (now - hit[0]) < ttl_seconds:
            return hit[1]
        val = loader()
        self._store[key] = (now, val)
        return val

    def invalidate(self, key: str | None = None) -> None:
        if key is None:
            self._store.clear()
        else:
            self._store.pop(key, None)

import time
from threading import Lock


class TokenBucket:
    def __init__(self, rate_per_minute: int, capacity: int | None = None):
        self.rate = rate_per_minute / 60.0  # tokens per second
        self.capacity = capacity or rate_per_minute
        self.tokens = self.capacity
        self.timestamp = time.monotonic()
        self._lock = Lock()

    def _refill(self):
        now = time.monotonic()
        elapsed = now - self.timestamp
        self.timestamp = now
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)

    def allow(self, cost: float = 1.0) -> bool:
        with self._lock:
            self._refill()
            if self.tokens >= cost:
                self.tokens -= cost
                return True
            return False

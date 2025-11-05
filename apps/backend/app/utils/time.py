from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

__all__ = ["utc_now", "utc_iso", "to_naive_utc"]


def utc_now() -> datetime:
    """Timezone-aware current UTC time (replaces datetime.utcnow)."""
    return datetime.now(timezone.utc)


def utc_iso(ts: Optional[datetime] = None) -> str:
    """Return RFC3339/ISO8601 string with a trailing Z for UTC."""
    d = ts or utc_now()
    # datetime.isoformat() returns +00:00 for UTC; normalize to Z
    return d.isoformat().replace("+00:00", "Z")


def to_naive_utc(dt: datetime) -> datetime:
    """Convert any datetime to UTC and drop tzinfo (use only for legacy naive UTC columns)."""
    if dt.tzinfo is None:
        # Assume naive input already represents UTC
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)

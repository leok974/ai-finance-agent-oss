"""Pure logic helpers for describe/help features (hermetic-safe).

Provides lightweight summarization / context shaping utilities that avoid any
FastAPI, database, or heavy analytics imports so they can be safely used in
hermetic test mode.
"""
from __future__ import annotations
from typing import Iterable, Sequence, Dict, Any


def build_contextual_summary(items: Sequence[Dict[str, Any]]) -> dict:
    """Return a compact summary structure from a list of item dicts.

    The logic is intentionally trivial: gather counts and a small sample.
    """
    total = len(items)
    sample = list(items[:3])
    keys = sorted({k for d in items for k in d.keys()}) if items else []
    return {
        "total": total,
        "keys": keys,
        "sample": sample,
    }


def redact_keys(obj: Any, sensitive: Iterable[str]) -> Any:
    sens = set(sensitive)
    if isinstance(obj, dict):
        return {k: ("[redacted]" if k in sens else redact_keys(v, sens)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact_keys(x, sens) for x in obj]
    return obj

__all__ = ["build_contextual_summary", "redact_keys"]

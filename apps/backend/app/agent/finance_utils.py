"""Shared utilities for finance agent modes."""

from typing import Dict, Tuple


def detect_empty_month(
    summary: Dict,
    expanded: Dict | None = None,
) -> Tuple[bool, int]:
    """
    Returns (is_empty, unknown_count).

    - is_empty: True when we effectively have no data for the month
    - unknown_count: unknown transaction count if present
    """
    income = float(summary.get("summary", {}).get("income") or 0.0)
    spend = float(summary.get("summary", {}).get("spend") or 0.0)
    net = float(summary.get("summary", {}).get("net") or 0.0)

    unknown_count = 0
    if expanded is not None:
        unknown = expanded.get("unknown_spend") or {}
        unknown_count = int(unknown.get("count") or 0)

    # Treat true "no data" as income == spend == net == 0 AND no unknowns
    is_empty = income == 0.0 and spend == 0.0 and net == 0.0 and unknown_count == 0
    return is_empty, unknown_count

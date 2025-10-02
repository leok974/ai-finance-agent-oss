"""Prometheus metrics helpers (optional).

The counters are created only if ``prometheus_client`` is installed. When the
library is absent, the exported names evaluate to ``None`` so callers can guard
lookups without additional import error handling.
"""

from __future__ import annotations

try:  # pragma: no cover - optional dependency for deployments with Prometheus
    from prometheus_client import Counter  # type: ignore
except Exception:  # pragma: no cover - silently disable metrics when missing
    Counter = None  # type: ignore

if Counter:
    help_describe_requests = Counter(
        "help_describe_requests_total",
        "Help describe requests",
        labelnames=("panel", "mode", "llm_called"),
    )
    help_describe_rephrased = Counter(
        "help_describe_rephrased_total",
        "Help describe responses that were rephrased",
        labelnames=("panel", "provider"),
    )
    help_describe_fallbacks = Counter(
        "help_describe_fallback_total",
        "Help describe non-rephrased classification",
        labelnames=("panel", "reason"),
    )
else:  # pragma: no cover - keep attributes for callers regardless of import
    help_describe_requests = None
    help_describe_rephrased = None
    help_describe_fallbacks = None

__all__ = [
    "help_describe_requests",
    "help_describe_rephrased",
    "help_describe_fallbacks",
]


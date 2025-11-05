"""Prometheus metrics helpers (optional).

The counters are created only if ``prometheus_client`` is installed. When the
library is absent, the exported names evaluate to ``None`` so callers can guard
lookups without additional import error handling.
"""

from __future__ import annotations

try:  # pragma: no cover - optional dependency for deployments with Prometheus
    from prometheus_client import Counter, Gauge, REGISTRY  # type: ignore
except Exception:  # pragma: no cover - silently disable metrics when missing
    Counter = None  # type: ignore
    Gauge = None  # type: ignore
    REGISTRY = None  # type: ignore

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
    # NOTE: ingest_errors and ingest_requests moved to app.services.metrics
else:  # pragma: no cover - keep attributes for callers regardless of import
    help_describe_requests = None
    help_describe_rephrased = None
    help_describe_fallbacks = None

# Optional crypto mode gauge (0=disabled, 1=kms)
if "Gauge" in globals() and Gauge:
    lm_crypto_mode = Gauge(
        "lm_crypto_mode",
        "LedgerMind crypto mode: 0=disabled,1=kms",
    )
else:  # pragma: no cover
    lm_crypto_mode = None


def prime_metrics():
    """Initialize metric label series at startup so they appear in /metrics output.

    NOTE: Ingest metrics are now in app.services.metrics and auto-primed there.
    This function is kept for backwards compatibility but currently does nothing.
    """
    pass


# NOTE: Do NOT auto-prime on import - must wait for FastAPI lifespan
# Auto-prime metrics on module import so they're immediately available
# prime_metrics()


def set_crypto_metrics(mode: str | None):
    """Set crypto mode gauge if available.
    mode: 'kms' -> 1.0; anything else -> 0.0.
    Safe to call even if prometheus_client is absent.
    """
    g = globals().get("lm_crypto_mode")
    try:
        if g is not None:
            g.set(1.0 if mode == "kms" else 0.0)
    except Exception:
        pass


__all__ = [
    "help_describe_requests",
    "help_describe_rephrased",
    "help_describe_fallbacks",
    "lm_crypto_mode",
    "set_crypto_metrics",
    "prime_metrics",
]

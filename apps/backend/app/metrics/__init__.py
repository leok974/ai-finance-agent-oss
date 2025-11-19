"""Prometheus metrics modules.

Consolidates all Prometheus metrics:
- Agent HMAC auth metrics (agent.py)
- Legacy help/describe metrics (migrated from app/metrics.py)
"""

from __future__ import annotations

# New agent HMAC auth metrics
from app.metrics.agent import (
    agent_requests_total,
    agent_replay_attempts_total,
    agent_auth_skew_ms,
)

# Legacy metrics - replicated here to avoid module shadowing issues
try:
    from prometheus_client import Counter, Gauge  # type: ignore
except Exception:
    Counter = None  # type: ignore
    Gauge = None  # type: ignore

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
    txn_categorized_total = Counter(
        "ledgermind_transactions_categorized_total",
        "Total number of transactions categorized by LedgerMind",
        labelnames=("category",),
    )
else:
    help_describe_requests = None
    help_describe_rephrased = None
    help_describe_fallbacks = None
    txn_categorized_total = None

if Gauge:
    lm_crypto_mode = Gauge(
        "lm_crypto_mode",
        "LedgerMind crypto mode: 0=disabled,1=kms",
    )
else:
    lm_crypto_mode = None


def set_crypto_metrics(mode: str | None):
    """Set crypto mode gauge if available."""
    try:
        if lm_crypto_mode is not None:
            lm_crypto_mode.set(1.0 if mode == "kms" else 0.0)
    except Exception:
        pass


__all__ = [
    # Agent HMAC metrics
    "agent_requests_total",
    "agent_replay_attempts_total",
    "agent_auth_skew_ms",
    # Legacy metrics
    "help_describe_requests",
    "help_describe_rephrased",
    "help_describe_fallbacks",
    "lm_crypto_mode",
    "set_crypto_metrics",
    "prime_metrics",
    # Categorization metrics
    "txn_categorized_total",
]


def prime_metrics() -> None:
    """Initialize metrics with zero values so they appear in /metrics immediately."""
    # Prime agent HMAC auth metrics
    try:
        if agent_requests_total:
            for auth in ["ok", "fail", "bypass"]:
                for mode in ["stub", "echo", "real", "hermetic"]:
                    agent_requests_total.labels(auth=auth, mode=mode)._value._value = (
                        0.0
                    )
    except Exception:
        pass

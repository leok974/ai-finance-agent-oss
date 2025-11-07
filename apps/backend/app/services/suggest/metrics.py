"""Prometheus metrics for ML suggestions."""

from prometheus_client import Counter

# Suggestion acceptance tracking
ml_suggestion_accepts_total = Counter(
    "lm_ml_suggestion_accepts_total",
    "Total number of accepted ML suggestions",
    ["model_version", "source", "label"],
)

# Suggestion rejection tracking
ml_suggestion_rejects_total = Counter(
    "lm_ml_suggestion_rejects_total",
    "Total number of rejected ML suggestions",
    ["model_version", "source", "label"],
)

# Ask agent triggers
ml_ask_agent_total = Counter(
    "lm_ml_ask_agent_total",
    "Total number of times confidence was too low (ask agent triggered)",
    ["reason"],
)

# Merchant majority hits
ml_merchant_majority_hits_total = Counter(
    "lm_ml_merchant_majority_hits_total",
    "Total number of suggestions from merchant majority voting",
    ["merchant_label"],
)


def record_suggestion_acceptance(
    *, model_version: str | None, source: str, label: str, accepted: bool
):
    """Record a suggestion acceptance or rejection.

    Args:
        model_version: Model version identifier
        source: Source type ('model', 'rule', 'ask')
        label: Suggested category label
        accepted: Whether the suggestion was accepted
    """
    version = model_version or "unknown"

    if accepted:
        ml_suggestion_accepts_total.labels(
            model_version=version, source=source, label=label
        ).inc()
    else:
        ml_suggestion_rejects_total.labels(
            model_version=version, source=source, label=label
        ).inc()


def record_ask_agent(reason: str = "low_confidence"):
    """Record an 'ask agent' trigger event.

    Args:
        reason: Reason for asking agent ('low_confidence', 'no_candidates', etc.)
    """
    ml_ask_agent_total.labels(reason=reason).inc()


def record_merchant_majority_hit(label: str):
    """Record a successful merchant majority suggestion.

    Args:
        label: Category label from merchant majority
    """
    ml_merchant_majority_hits_total.labels(merchant_label=label).inc()

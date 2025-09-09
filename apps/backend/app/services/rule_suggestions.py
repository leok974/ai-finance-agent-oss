from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.orm_models import RuleSuggestion, Feedback, Transaction, Rule  # type: ignore


# Thresholds for promoting a candidate into a persistent suggestion
MIN_SUPPORT = 3
MIN_POSITIVE = 0.8
WINDOW_DAYS = 45


def canonicalize_merchant(name: str | None) -> str:
    """Lowercase, remove punctuation, collapse spaces.
    Keep this in sync with any frontend or ETL canonicalization logic.
    """
    if not name:
        return ""
    out = "".join(ch.lower() if (ch.isalnum() or ch.isspace()) else " " for ch in name)
    out = " ".join(out.split())
    return out


def compute_metrics(db: Session, merchant_norm: str, category: str) -> Optional[Tuple[int, float, datetime]]:
    """
    Compute (support_count, positive_rate, last_seen) over a recent time window.

    Our Feedback model stores labels for transactions, not explicit accept/reject actions.
    We approximate:
      - support_count = number of Feedback rows for this merchant_norm whose label == category
      - total = all Feedback rows for this merchant_norm (any label)
      - positive_rate = support_count / total
    """
    window_start = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)

    # Pull recent feedback joined to their transactions; then compute canonicalization in Python.
    rows = (
        db.query(Feedback, Transaction.merchant, Feedback.created_at)
        .join(Transaction, Feedback.txn_id == Transaction.id)
        .filter(Feedback.created_at >= window_start)
        .all()
    )

    # Filter by normalized merchant
    filtered = [r for r in rows if canonicalize_merchant(r[1]) == merchant_norm]
    if not filtered:
        return None

    cat_lower = category.lower()
    support_count = sum(1 for f, _m, _ts in filtered if (f.label or "").lower() == cat_lower)
    total = len(filtered)
    if total == 0:
        return None
    positive_rate = support_count / total
    last_seen = max((ts for _f, _m, ts in filtered), default=datetime.now(timezone.utc))
    return support_count, positive_rate, last_seen


def upsert_suggestion(
    db: Session,
    merchant_norm: str,
    category: str,
    support_count: int,
    positive_rate: float,
    last_seen: datetime,
) -> RuleSuggestion:
    row = (
        db.query(RuleSuggestion)
        .filter(RuleSuggestion.merchant_norm == merchant_norm)
        .filter(RuleSuggestion.category == category)
        .one_or_none()
    )
    if row is None:
        row = RuleSuggestion(
            merchant_norm=merchant_norm,
            category=category,
            support_count=support_count,
            positive_rate=positive_rate,
            last_seen=last_seen,
            ignored=False,
        )
        db.add(row)
    else:
        row.support_count = support_count
        row.positive_rate = positive_rate
        row.last_seen = last_seen
    db.flush()
    return row


def evaluate_candidate(db: Session, merchant_norm: str, category: str) -> Optional[RuleSuggestion]:
    """Return a (persisted) suggestion if thresholds are met, else None (no write)."""
    metrics = compute_metrics(db, merchant_norm, category)
    if not metrics:
        return None
    support_count, rate, last_seen = metrics
    if support_count < MIN_SUPPORT or rate < MIN_POSITIVE:
        return None

    # TODO: At a later step, add a coverage check to avoid suggesting categories
    # that are already enforced by an existing Rule.
    # Example:
    #   covered = db.query(Rule).filter(... pattern matches merchant_norm ...).first()
    #   if covered: return None

    return upsert_suggestion(db, merchant_norm, category, support_count, rate, last_seen)

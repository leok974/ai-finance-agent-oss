from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.orm_models import RuleSuggestion, Feedback, Transaction, Rule  # type: ignore


# Thresholds for promoting a candidate into a persistent suggestion
MIN_SUPPORT = 3
MIN_POSITIVE = 0.8
# In step 2, disable windowing to avoid NULL created_at issues in tests.
# We'll re-enable with a migration that guarantees created_at defaults.
WINDOW_DAYS = None


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
    Compute (accepts, positive_rate, last_seen) using Python-side counting.

    - Join Feedback -> Transaction so we can canonicalize txn.merchant in Python.
    - Match rows where canonicalize_merchant(txn.merchant) == merchant_norm and
      lower(label) == category.lower().
    - accepts = count of Feedback.source == "accept" among matched rows
    - total = count of Feedback.source in {"accept","reject"} among matched rows; if no rejects stored, total == accepts
    - last_seen = max(created_at) among matched rows; fallback to now if none
    Windowing is disabled for Step 2.
    """
    rows = (
        db.query(Feedback, Transaction)
        .join(Transaction, Feedback.txn_id == Transaction.id)
        .all()
    )

    accepts = 0
    total = 0
    label_matches = 0
    last_seen: datetime | None = None
    cat_lower = (category or "").strip().lower()

    for fb, txn in rows:
        mnorm = canonicalize_merchant((getattr(txn, "merchant", None) or "").strip())
        if mnorm != merchant_norm:
            continue
        if (getattr(fb, "label", "") or "").strip().lower() != cat_lower:
            continue
        # Track label matches regardless of source for fallback behavior
        label_matches += 1

        src = (getattr(fb, "source", "") or "").strip().lower()
        if src in ("accept", "reject"):
            total += 1
        if src == "accept":
            accepts += 1

        ts = getattr(fb, "created_at", None)
        if ts is not None:
            last_seen = max(last_seen or ts, ts)

    if total == 0:
        # Fallback: when no explicit accept/reject stored, treat all matches as accepts
        if label_matches == 0:
            return None
        accepts = label_matches
        total = label_matches
    rate = accepts / total if total else 1.0
    return accepts, rate, (last_seen or datetime.now(timezone.utc))


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

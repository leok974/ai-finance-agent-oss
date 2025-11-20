"""ML Feedback Scores - Adjust suggestion scores based on historical feedback."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import log1p
from typing import Dict, Iterable, List

from sqlalchemy.orm import Session

from app.models.ml_feedback_stats import MlFeedbackMerchantCategoryStats


@dataclass(frozen=True)
class FeedbackKey:
    """Key for looking up feedback stats."""

    merchant_normalized: str
    category: str


@dataclass
class FeedbackStats:
    """Aggregated feedback statistics for a merchant+category pair."""

    accept_count: int
    reject_count: int
    last_feedback_at: datetime | None = None


def load_feedback_stats_map(
    db: Session,
    keys: Iterable[FeedbackKey],
) -> Dict[FeedbackKey, FeedbackStats]:
    """
    Batch-load feedback stats for a set of (merchant_normalized, category) keys.
    Returns a dict keyed by FeedbackKey.
    
    This avoids N+1 queries by loading all stats in a single DB round-trip.
    """
    unique_keys = {
        (k.merchant_normalized, k.category)
        for k in keys
        if k.merchant_normalized and k.category
    }
    if not unique_keys:
        return {}

    merchant_values = {m for (m, _c) in unique_keys}
    category_values = {c for (_m, c) in unique_keys}

    # Fetch all matching stats rows
    rows: List[MlFeedbackMerchantCategoryStats] = (
        db.query(MlFeedbackMerchantCategoryStats)
        .filter(
            MlFeedbackMerchantCategoryStats.merchant_normalized.in_(merchant_values),
            MlFeedbackMerchantCategoryStats.category.in_(category_values),
        )
        .all()
    )

    result: Dict[FeedbackKey, FeedbackStats] = {}
    for row in rows:
        key = FeedbackKey(
            merchant_normalized=row.merchant_normalized,
            category=row.category,
        )
        result[key] = FeedbackStats(
            accept_count=row.accept_count or 0,
            reject_count=row.reject_count or 0,
            last_feedback_at=row.last_feedback_at,
        )
    return result


def adjust_score_with_feedback(
    base_score: float,
    merchant_normalized: str | None,
    category: str | None,
    stats: FeedbackStats | None,
) -> float:
    """
    Adjust suggestion score based on historical feedback.
    
    Formula:
        final_score = base_score
                    + 0.20 * log1p(accept_count)    # Boost for accepts
                    - 0.30 * log1p(reject_count)    # Penalty for rejects
                    + 0.05 (if recent feedback)     # Recency bonus
    
    Safe-by-default: if no stats or missing merchant/category, returns base_score.
    """
    if not merchant_normalized or not category or stats is None:
        return base_score

    score = base_score

    # Accepts → boost (log1p prevents overweighting early accepts)
    if stats.accept_count > 0:
        accept_bonus = log1p(stats.accept_count)
        score += 0.20 * accept_bonus

    # Rejects → penalty (slightly stronger than accept boost)
    if stats.reject_count > 0:
        reject_penalty = log1p(stats.reject_count)
        score -= 0.30 * reject_penalty

    # Optional: small recency bonus (feedback in last 30 days)
    if stats.last_feedback_at:
        now = datetime.now(timezone.utc)
        delta_days = (now - stats.last_feedback_at).days
        if delta_days <= 30:
            # Recent feedback → slight boost for exploration
            score += 0.05

    return score

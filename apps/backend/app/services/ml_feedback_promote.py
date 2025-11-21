"""Promote ML feedback stats to merchant category hints.

This service identifies strong merchant+category patterns from user feedback
and promotes them to hints that power future suggestions.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import log1p
from typing import Any, Dict, List, Literal, Optional

from sqlalchemy.orm import Session
from sqlalchemy import text, select, update, insert

from app.models.ml_feedback_stats import MlFeedbackMerchantCategoryStats


# --- Tuning knobs ------------------------------------------------------------

MIN_TOTAL_FEEDBACK = 2  # min accept+reject to consider
MIN_ACCEPTS = 2  # min accepts to consider
MIN_ACCEPT_RATIO = 0.7  # minimum accept / total
MAX_REJECT_RATIO = 0.3  # maximum reject / total
RECENT_DAYS_FOR_BONUS = 30  # recency window
SOURCE_LABEL = "ml_feedback"  # source value for hints from feedback


@dataclass
class PromotionCandidate:
    merchant_normalized: str
    category: str
    accept_count: int
    reject_count: int
    last_feedback_at: datetime
    confidence: float


@dataclass
class PromotionResult:
    promoted: List[PromotionCandidate]
    skipped: List[Dict[str, Any]]


def _compute_confidence(
    accept_count: int,
    reject_count: int,
    last_feedback_at: datetime,
    now: Optional[datetime] = None,
) -> float:
    """
    Map (accept/reject counts, recency) → [0.0, 1.0] confidence.

    Intuition:
    - Higher accept_count → higher confidence (log-scaled).
    - More rejects → reduce confidence.
    - Recent feedback → small bonus.
    """
    if now is None:
        now = datetime.utcnow()

    total = accept_count + reject_count
    if total <= 0:
        return 0.0

    accept_ratio = accept_count / total
    reject_ratio = reject_count / total

    # Base confidence from accept ratio
    #  - 0.7 ratio → ~0.6
    #  - 1.0 ratio → ~0.8 before volume bonus
    base = 0.4 + 0.4 * accept_ratio

    # Volume bonus: log-scaled on total interactions
    volume_bonus = min(0.2, 0.1 * log1p(total))

    # Penalty for rejects
    reject_penalty = 0.3 * reject_ratio  # up to -0.3

    # Recency bonus
    recent_bonus = 0.0
    if now - last_feedback_at <= timedelta(days=RECENT_DAYS_FOR_BONUS):
        recent_bonus = 0.05

    confidence = base + volume_bonus + recent_bonus - reject_penalty

    # Clamp to [0.0, 0.99]
    confidence = max(0.0, min(confidence, 0.99))
    return confidence


def promote_feedback_to_hints(
    db: Session,
    *,
    dry_run: bool = False,
    now: Optional[datetime] = None,
) -> PromotionResult:
    """
    Promote strong (merchant_normalized, category) pairs from
    ml_feedback_merchant_category_stats → merchant_category_hints.

    - Only promotes when:
      - accept_count + reject_count >= MIN_TOTAL_FEEDBACK
      - accept_count >= MIN_ACCEPTS
      - accept_ratio >= MIN_ACCEPT_RATIO
      - reject_ratio <= MAX_REJECT_RATIO
    - Writes hints with `source = SOURCE_LABEL` and computed confidence.
    - On conflict, updates existing hint's confidence and source.
    """
    if now is None:
        now = datetime.utcnow()

    # 1) Load candidate stats
    rows = (
        db.execute(
            text(
                """
            SELECT
                merchant_normalized,
                category,
                accept_count,
                reject_count,
                last_feedback_at
            FROM ml_feedback_merchant_category_stats
            WHERE (accept_count + reject_count) >= :min_total
            """
            ),
            {"min_total": MIN_TOTAL_FEEDBACK},
        )
        .mappings()
        .all()
    )

    promoted: List[PromotionCandidate] = []
    skipped: List[Dict[str, Any]] = []

    for row in rows:
        merchant = row["merchant_normalized"]
        category = row["category"]
        accept_count = int(row["accept_count"])
        reject_count = int(row["reject_count"])
        last_feedback_at = row["last_feedback_at"]

        if not merchant or not category:
            skipped.append(
                {
                    "merchant_normalized": merchant,
                    "category": category,
                    "reason": "missing_merchant_or_category",
                }
            )
            continue

        total = accept_count + reject_count
        if total < MIN_TOTAL_FEEDBACK:
            skipped.append(
                {
                    "merchant_normalized": merchant,
                    "category": category,
                    "reason": "insufficient_total_feedback",
                    "accept_count": accept_count,
                    "reject_count": reject_count,
                }
            )
            continue

        accept_ratio = accept_count / total
        reject_ratio = reject_count / total

        if accept_count < MIN_ACCEPTS:
            skipped.append(
                {
                    "merchant_normalized": merchant,
                    "category": category,
                    "reason": "insufficient_accepts",
                    "accept_count": accept_count,
                    "reject_count": reject_count,
                }
            )
            continue

        if accept_ratio < MIN_ACCEPT_RATIO:
            skipped.append(
                {
                    "merchant_normalized": merchant,
                    "category": category,
                    "reason": "low_accept_ratio",
                    "accept_ratio": accept_ratio,
                    "accept_count": accept_count,
                    "reject_count": reject_count,
                }
            )
            continue

        if reject_ratio > MAX_REJECT_RATIO:
            skipped.append(
                {
                    "merchant_normalized": merchant,
                    "category": category,
                    "reason": "high_reject_ratio",
                    "reject_ratio": reject_ratio,
                    "accept_count": accept_count,
                    "reject_count": reject_count,
                }
            )
            continue

        confidence = _compute_confidence(
            accept_count=accept_count,
            reject_count=reject_count,
            last_feedback_at=last_feedback_at,
            now=now,
        )

        candidate = PromotionCandidate(
            merchant_normalized=merchant,
            category=category,
            accept_count=accept_count,
            reject_count=reject_count,
            last_feedback_at=last_feedback_at,
            confidence=confidence,
        )
        promoted.append(candidate)

        if dry_run:
            # Don't write to DB; just collect
            continue

        # 2) Upsert into merchant_category_hints
        db.execute(
            text(
                """
                INSERT INTO merchant_category_hints
                    (merchant_canonical, category_slug, source, confidence)
                VALUES
                    (:merchant, :category, :source, :confidence)
                ON CONFLICT (merchant_canonical, category_slug) DO UPDATE
                SET
                    confidence = EXCLUDED.confidence,
                    source     = EXCLUDED.source
                """
            ),
            {
                "merchant": merchant,
                "category": category,
                "source": SOURCE_LABEL,
                "confidence": confidence,
            },
        )

    if not dry_run:
        db.commit()

    return PromotionResult(promoted=promoted, skipped=skipped)


# --- Rule feedback logging ---------------------------------------------------

RuleFeedbackAction = Literal["accept", "reject"]


def log_rule_feedback_to_stats(
    db: Session,
    merchant_normalized: str,
    category: str,
    action: RuleFeedbackAction,
    weight: int = 1,
) -> None:
    """
    Log rule-level feedback into ml_feedback_merchant_category_stats.

    This does NOT create an event row; it directly adjusts the aggregate stats
    so scoring sees rule changes as soft accept/reject signals.

    - enable rule  -> action="accept"
    - disable rule -> action="reject"
    - delete rule  -> action="reject", typically with higher weight
    """
    if not merchant_normalized or not category:
        return

    now = datetime.now(timezone.utc)

    stmt = select(MlFeedbackMerchantCategoryStats).where(
        MlFeedbackMerchantCategoryStats.merchant_normalized == merchant_normalized,
        MlFeedbackMerchantCategoryStats.category == category,
    )
    existing = db.execute(stmt).scalar_one_or_none()

    if existing:
        accept = existing.accept_count or 0
        reject = existing.reject_count or 0
        if action == "accept":
            accept += max(1, weight)
        else:
            reject += max(1, weight)

        db.execute(
            update(MlFeedbackMerchantCategoryStats)
            .where(
                MlFeedbackMerchantCategoryStats.merchant_normalized
                == merchant_normalized,
                MlFeedbackMerchantCategoryStats.category == category,
            )
            .values(
                accept_count=accept,
                reject_count=reject,
                last_feedback_at=now,
            )
        )
    else:
        accept = max(1, weight) if action == "accept" else 0
        reject = max(1, weight) if action == "reject" else 0

        db.execute(
            insert(MlFeedbackMerchantCategoryStats).values(
                merchant_normalized=merchant_normalized,
                category=category,
                accept_count=accept,
                reject_count=reject,
                last_feedback_at=now,
            )
        )

    db.commit()

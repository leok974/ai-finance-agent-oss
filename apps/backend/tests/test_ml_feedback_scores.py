"""Tests for ML feedback scoring."""

from datetime import datetime, timedelta, timezone

from app.services.ml_feedback_scores import FeedbackStats, adjust_score_with_feedback


def test_adjust_score_with_no_stats_returns_base():
    """Score unchanged when no feedback stats available."""
    base = 0.7
    new = adjust_score_with_feedback(base, "some-merchant", "groceries", None)
    assert new == base


def test_accepts_increase_score():
    """Accept feedback boosts suggestion score."""
    base = 0.5
    stats = FeedbackStats(accept_count=10, reject_count=0)
    new = adjust_score_with_feedback(base, "merchant", "groceries", stats)
    assert new > base, f"Expected score > {base}, got {new}"


def test_rejects_decrease_score():
    """Reject feedback penalizes suggestion score."""
    base = 0.8
    stats = FeedbackStats(accept_count=0, reject_count=7)
    new = adjust_score_with_feedback(base, "merchant", "groceries", stats)
    assert new < base, f"Expected score < {base}, got {new}"


def test_recent_feedback_gets_small_bonus():
    """Recent feedback (within 30 days) adds small exploration bonus."""
    base = 0.6
    now = datetime.now(timezone.utc)
    stats = FeedbackStats(
        accept_count=0,
        reject_count=0,
        last_feedback_at=now - timedelta(days=5),
    )
    new = adjust_score_with_feedback(base, "merchant", "groceries", stats)
    assert new > base, f"Expected recency bonus, got {new} == {base}"


def test_old_feedback_no_recency_bonus():
    """Old feedback (>30 days) does not get recency bonus."""
    base = 0.6
    now = datetime.now(timezone.utc)
    stats = FeedbackStats(
        accept_count=0,
        reject_count=0,
        last_feedback_at=now - timedelta(days=60),
    )
    new = adjust_score_with_feedback(base, "merchant", "groceries", stats)
    # No accepts, no rejects, no recency → score unchanged
    assert new == base


def test_balanced_feedback():
    """Both accepts and rejects are applied with correct weights."""
    base = 0.5
    stats = FeedbackStats(accept_count=5, reject_count=5)
    new = adjust_score_with_feedback(base, "merchant", "groceries", stats)
    # Rejects have stronger penalty (0.30 vs 0.20), so score should decrease
    assert new < base, f"Expected penalty dominance, got {new} >= {base}"


def test_missing_merchant_returns_base():
    """Missing merchant_normalized returns base score unchanged."""
    base = 0.7
    stats = FeedbackStats(accept_count=10, reject_count=0)
    new = adjust_score_with_feedback(base, None, "groceries", stats)
    assert new == base


def test_missing_category_returns_base():
    """Missing category returns base score unchanged."""
    base = 0.7
    stats = FeedbackStats(accept_count=10, reject_count=0)
    new = adjust_score_with_feedback(base, "merchant", None, stats)
    assert new == base

"""Admin endpoints for ML feedback management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.ml_feedback_promote import promote_feedback_to_hints

router = APIRouter(
    prefix="/admin/ml-feedback",
    tags=["admin", "ml-feedback"],
)


@router.post("/promote-hints")
def promote_hints(
    dry_run: bool = Query(
        False,
        description="If true, do not write hints; just return what would be promoted.",
    ),
    db: Session = Depends(get_db),
):
    """
    Promote strong (merchant, category) pairs from ML feedback stats
    into merchant_category_hints.

    This endpoint supports dry_run for inspection.

    Promotion criteria:
    - Total feedback (accept + reject) >= 2
    - Accept count >= 2
    - Accept ratio >= 0.7 (70% acceptance)
    - Reject ratio <= 0.3 (30% rejection)

    Confidence scoring:
    - Base: 0.4 + 0.4 * accept_ratio
    - Volume bonus: up to +0.2 (log-scaled)
    - Recency bonus: +0.05 if feedback within 30 days
    - Reject penalty: up to -0.3
    - Final range: [0.0, 0.99]
    """
    result = promote_feedback_to_hints(db=db, dry_run=dry_run)
    return {
        "promoted_count": len(result.promoted),
        "skipped_count": len(result.skipped),
        "promoted": [
            {
                "merchant_normalized": c.merchant_normalized,
                "category": c.category,
                "accept_count": c.accept_count,
                "reject_count": c.reject_count,
                "last_feedback_at": c.last_feedback_at.isoformat(),
                "confidence": round(c.confidence, 3),
            }
            for c in result.promoted
        ],
        "skipped": result.skipped,
    }

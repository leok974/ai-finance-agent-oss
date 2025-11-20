"""Admin endpoints for ML feedback management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db import get_db
from app.services.ml_feedback_promote import promote_feedback_to_hints

router = APIRouter(
    prefix="/admin/ml-feedback",
    tags=["admin", "ml-feedback"],
)


@router.get("/hints")
def list_hints(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    List promoted merchant category hints.

    Returns paginated list of hints with confidence scores and support counts.
    """
    # Get total count
    total_result = db.execute(text("SELECT COUNT(*) FROM merchant_category_hints"))
    total = total_result.scalar() or 0

    # Get paginated results
    hints_result = db.execute(
        text(
            """
            SELECT id, merchant_canonical, category_slug, confidence, support,
                   created_at, updated_at
            FROM merchant_category_hints
            ORDER BY updated_at DESC NULLS LAST
            LIMIT :limit OFFSET :offset
        """
        ),
        {"limit": limit, "offset": offset},
    )

    hints = []
    for row in hints_result:
        hints.append(
            {
                "id": row.id,
                "merchant_canonical": row.merchant_canonical,
                "category_slug": row.category_slug,
                "confidence": round(row.confidence, 3) if row.confidence else 0.0,
                "support": row.support or 0,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
        )

    return {
        "items": hints,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


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

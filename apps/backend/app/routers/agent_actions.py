"""Agent next-best-actions aggregator."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db import get_db
from app.utils.auth import get_current_user
from app.orm_models import User
from typing import List, Dict, Any

router = APIRouter(prefix="/agent", tags=["agent"])


@router.get("/actions")
async def get_next_actions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Return top 3 next-best-actions for the user.
    Priority: budget overspend > anomalies > uncategorized txns.
    """
    actions: List[Dict[str, Any]] = []

    # 1. Budget overspend (high priority)
    try:
        from app.services.budget_recommend import compute_recommendations

        recs = compute_recommendations(
            db, user_id=user.id if hasattr(user, "id") else None
        )
        for rec in recs[:1]:  # Top 1 budget issue
            if rec.get("overspend", 0) > 0:
                actions.append(
                    {
                        "type": "budget_alert",
                        "title": f"Review {rec['category']} budget",
                        "description": f"Spent ${rec['actual']:.2f} of ${rec['budget']:.2f}",
                        "priority": "high",
                        "action_url": f"/app/budget?category={rec['category']}",
                    }
                )
    except Exception:
        pass  # Budget service may not be available

    # 2. Anomalies (medium priority)
    try:
        from app.services.insights_anomalies import compute_anomalies

        anomalies = compute_anomalies(
            db, user_id=user.id if hasattr(user, "id") else None
        )
        for anom in anomalies[:1]:  # Top 1 anomaly
            actions.append(
                {
                    "type": "anomaly",
                    "title": f"Unusual spend: {anom.get('merchant', 'Unknown')}",
                    "description": f"${anom.get('amount', 0):.2f} vs avg ${anom.get('avg', 0):.2f}",
                    "priority": "medium",
                    "action_url": f"/app/transactions?merchant={anom.get('merchant', '')}",
                }
            )
    except Exception:
        pass

    # 3. Uncategorized transactions (low priority)
    try:
        unk_count = (
            db.execute(
                text(
                    "SELECT COUNT(*) FROM transactions WHERE category IS NULL OR category='Unknown'"
                )
            ).scalar()
            or 0
        )
        if unk_count > 0:
            actions.append(
                {
                    "type": "categorize",
                    "title": "Categorize transactions",
                    "description": f"{unk_count} transactions need categories",
                    "priority": "low",
                    "action_url": "/app/transactions?category=Unknown",
                }
            )
    except Exception:
        pass

    return {"actions": actions[:3]}

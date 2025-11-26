from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.db import get_db
from app.deps.auth_guard import get_current_user_id
from app.services.analytics_alerts import compute_alerts_for_month, AlertsResult

router = APIRouter()


class AlertsRequest(BaseModel):
    month: Optional[str] = None


@router.post("")
def alerts(
    payload: AlertsRequest = AlertsRequest(),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> AlertsResult:
    """
    Compute actionable alerts for a given month.
    Returns alerts with severity, title, description, and context.

    Requires authentication. Filters alerts to current user's transactions only.
    """
    # Resolve month if not provided
    month = payload.month
    if not month:
        # Get latest month from user's transactions
        from datetime import datetime
        from sqlalchemy import func
        from app.transactions import Transaction

        latest = (
            db.query(func.max(Transaction.booked_at))
            .filter(Transaction.user_id == user_id)
            .scalar()
        )
        if latest:
            month = latest.strftime("%Y-%m")
        else:
            month = datetime.now().strftime("%Y-%m")

    return compute_alerts_for_month(db=db, month=month, user_id=user_id)

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.db import get_db
from app.services.analytics_alerts import compute_alerts_for_month, AlertsResult

router = APIRouter()


class AlertsRequest(BaseModel):
    month: Optional[str] = None


@router.post("")
def alerts(
    payload: AlertsRequest = AlertsRequest(),
    db: Session = Depends(get_db),
) -> AlertsResult:
    """
    Compute actionable alerts for a given month.
    Returns alerts with severity, title, description, and context.
    """
    # Resolve month if not provided
    month = payload.month
    if not month:
        # Get latest month from transactions
        from datetime import datetime
        from sqlalchemy import func
        from app.transactions import Transaction

        latest = db.query(func.max(Transaction.booked_at)).scalar()
        if latest:
            month = latest.strftime("%Y-%m")
        else:
            month = datetime.now().strftime("%Y-%m")

    return compute_alerts_for_month(db=db, month=month)

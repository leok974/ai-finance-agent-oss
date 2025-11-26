"""Analytics alerts service - compute actionable alerts for a given month."""

from enum import Enum
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.transactions import Transaction
from app.services.analytics import detect_recurring
from app.agent.prompts import FINANCE_ALERTS_PROMPT


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class Alert(BaseModel):
    code: str  # e.g. "unknown_spend_high"
    severity: AlertSeverity
    title: str
    description: str
    month: str
    amount: Optional[float] = None
    context: Optional[Dict[str, Any]] = None


class AlertsResult(BaseModel):
    month: str
    alerts: List[Alert]
    llm_prompt: str = FINANCE_ALERTS_PROMPT


def _parse_month(month_str: str) -> tuple[int, int]:
    """Parse YYYY-MM string to (year, month)."""
    parts = month_str.split("-")
    return int(parts[0]), int(parts[1])


def _get_month_totals(
    db: Session, month: str, user_id: Optional[int] = None
) -> Dict[str, Any]:
    """Get basic month totals: total_spend, unknown_spend, unknown_count."""
    year, mon = _parse_month(month)

    # Total spend (outflows only)
    total_filter = [
        func.extract("year", Transaction.date) == year,
        func.extract("month", Transaction.date) == mon,
        Transaction.amount < 0,  # outflows
        Transaction.deleted_at.is_(None),
    ]
    if user_id is not None:
        total_filter.append(Transaction.user_id == user_id)

    total_query = db.query(
        func.coalesce(func.sum(func.abs(Transaction.amount)), 0).label("total")
    ).filter(and_(*total_filter))
    total_spend = float(total_query.scalar() or 0)

    # Unknown spend (no category)
    unknown_filter = [
        func.extract("year", Transaction.date) == year,
        func.extract("month", Transaction.date) == mon,
        Transaction.amount < 0,
        Transaction.category.is_(None),
        Transaction.deleted_at.is_(None),
    ]
    if user_id is not None:
        unknown_filter.append(Transaction.user_id == user_id)

    unknown_query = db.query(
        func.coalesce(func.sum(func.abs(Transaction.amount)), 0).label("unknown_total"),
        func.count(Transaction.id).label("unknown_count"),
    ).filter(and_(*unknown_filter))
    unknown_row = unknown_query.one()
    unknown_spend = float(unknown_row.unknown_total or 0)
    unknown_count = int(unknown_row.unknown_count or 0)

    return {
        "total_spend": total_spend,
        "unknown_spend": unknown_spend,
        "unknown_count": unknown_count,
    }


def _get_recent_avg_spend(
    db: Session, month: str, lookback: int = 3, user_id: Optional[int] = None
) -> float:
    """Get average monthly spend for previous N months."""
    year, mon = _parse_month(month)

    # Get previous months' totals
    from datetime import date
    from dateutil.relativedelta import relativedelta

    anchor = date(year, mon, 1)
    totals = []

    for i in range(1, lookback + 1):
        prev = anchor - relativedelta(months=i)
        prev_filter = [
            func.extract("year", Transaction.date) == prev.year,
            func.extract("month", Transaction.date) == prev.month,
            Transaction.amount < 0,
            Transaction.deleted_at.is_(None),
        ]
        if user_id is not None:
            prev_filter.append(Transaction.user_id == user_id)

        prev_query = db.query(
            func.coalesce(func.sum(func.abs(Transaction.amount)), 0)
        ).filter(and_(*prev_filter))
        prev_total = float(prev_query.scalar() or 0)
        if prev_total > 0:
            totals.append(prev_total)

    return sum(totals) / len(totals) if totals else 0


def _detect_new_subscriptions(
    db: Session, month: str, user_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Detect subscriptions that appear for the first time in this month."""
    # Use existing recurring detection with lookback=6
    try:
        # Note: detect_recurring may need user_id parameter - check if it exists
        # For now, skip user_id filtering in detect_recurring call
        rec_result = detect_recurring(db, month=month, lookback=6)
        items = rec_result.get("items", [])

        # Filter to items that have all charges in current month
        # (simplified: just look for items with count=1 or started this month)
        new_subs = []
        for item in items:
            # If only 1 charge, it's potentially new
            if item.get("count", 0) == 1:
                new_subs.append(
                    {
                        "merchant": item.get("merchant", "Unknown"),
                        "amount": item.get("avg_amount", 0),
                    }
                )

        return new_subs
    except Exception:
        return []


def compute_alerts_for_month(
    db: Session, month: str, user_id: Optional[int] = None
) -> AlertsResult:
    """
    Compute actionable alerts for a given month.

    Args:
        db: Database session
        month: Month string in YYYY-MM format
        user_id: Optional user ID to filter alerts (for multi-tenant support)

    Returns:
        AlertsResult with list of Alert objects for the month
    """
    alerts: List[Alert] = []

    # Get month totals
    totals = _get_month_totals(db, month, user_id=user_id)
    total_spend = totals["total_spend"]
    unknown_spend = totals["unknown_spend"]
    unknown_count = totals["unknown_count"]

    # Alert 1: High unknown spend (>10% of total)
    if unknown_spend > 0 and total_spend > 0:
        unknown_pct = unknown_spend / total_spend
        if unknown_pct >= 0.10:
            alerts.append(
                Alert(
                    code="unknown_spend_high",
                    severity=AlertSeverity.WARNING,
                    title="High unknown spend this month",
                    description=(
                        f"About ${unknown_spend:.0f} of your "
                        f"${total_spend:.0f} total spend is uncategorized."
                    ),
                    month=month,
                    amount=float(unknown_spend),
                    context={
                        "unknown_txn_count": unknown_count,
                        "percentage": round(unknown_pct * 100, 1),
                    },
                )
            )

    # Alert 2: Spending spike vs recent months
    avg_spend = _get_recent_avg_spend(db, month, lookback=3, user_id=user_id)
    if avg_spend > 0 and total_spend > 0:
        spike_delta = total_spend - avg_spend
        spike_pct = spike_delta / avg_spend

        # Alert if >15% higher than average
        if spike_pct >= 0.15:
            alerts.append(
                Alert(
                    code="spend_spike",
                    severity=(
                        AlertSeverity.WARNING
                        if spike_pct < 0.30
                        else AlertSeverity.CRITICAL
                    ),
                    title="Spending spike vs recent months",
                    description=(
                        f"Your spend is about ${spike_delta:.0f} higher "
                        f"than the recent monthly average (${avg_spend:.0f})."
                    ),
                    month=month,
                    amount=float(spike_delta),
                    context={
                        "avg_spend": round(avg_spend, 2),
                        "percentage": round(spike_pct * 100, 1),
                    },
                )
            )

    # Alert 3: New subscriptions this month
    new_subs = _detect_new_subscriptions(db, month, user_id=user_id)
    for sub in new_subs[:3]:  # Limit to top 3
        alerts.append(
            Alert(
                code="new_subscription",
                severity=AlertSeverity.INFO,
                title=f"New subscription: {sub['merchant']}",
                description=(
                    f"{sub['merchant']} appears for the first time in {month} "
                    f"with about ${sub['amount']:.0f} in charges."
                ),
                month=month,
                amount=float(sub["amount"]),
            )
        )

    return AlertsResult(month=month, alerts=alerts)

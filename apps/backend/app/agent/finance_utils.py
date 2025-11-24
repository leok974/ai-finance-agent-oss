"""Shared utilities for finance agent modes."""

from typing import Dict, Tuple, List
from datetime import datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from pydantic import BaseModel


def detect_empty_month(
    summary: Dict,
    expanded: Dict | None = None,
) -> Tuple[bool, int]:
    """
    Returns (is_empty, unknown_count).

    - is_empty: True when we effectively have no data for the month
    - unknown_count: unknown transaction count if present
    """
    income = float(summary.get("summary", {}).get("income") or 0.0)
    spend = float(summary.get("summary", {}).get("spend") or 0.0)
    net = float(summary.get("summary", {}).get("net") or 0.0)

    unknown_count = 0
    if expanded is not None:
        unknown = expanded.get("unknown_spend") or {}
        unknown_count = int(unknown.get("count") or 0)

    # Treat true "no data" as income == spend == net == 0 AND no unknowns
    is_empty = income == 0.0 and spend == 0.0 and net == 0.0 and unknown_count == 0
    return is_empty, unknown_count


# ============================================================================
# Demo Data Utilities
# ============================================================================


class DemoCategoryAverage(BaseModel):
    """Category spending average for demo data."""

    category_slug: str
    category_label: str
    monthly_avg: float
    txn_count: int


def get_demo_category_monthly_averages(
    db: Session,
    user_id: int,
    months: int = 6,
) -> List[DemoCategoryAverage]:
    """
    Query demo transactions for the given user and return category averages.

    Args:
        db: Database session
        user_id: User ID (demo user)
        months: Number of months to average over (default 6)

    Returns:
        List of category averages sorted by monthly spend (descending)
    """
    from app.orm_models import Transaction

    # Calculate the date range (last N months)
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=months * 30)

    # Query transactions grouped by category
    # Only include spend (negative amounts), exclude income/transfers
    query = (
        select(
            Transaction.category,
            func.sum(Transaction.amount).label("total_spend"),
            func.count(Transaction.id).label("txn_count"),
        )
        .where(Transaction.user_id == user_id)
        .where(Transaction.date >= start_date)
        .where(Transaction.date <= end_date)
        .where(Transaction.deleted_at.is_(None))
        .where(Transaction.amount < 0)  # Only expenses (negative amounts)
        .where(Transaction.category.isnot(None))
        .where(Transaction.category != "income")
        .where(Transaction.category != "transfers")
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).asc())  # Most negative first
    )

    results = db.execute(query).all()

    # Convert to DemoCategoryAverage objects
    averages = []
    for row in results:
        category_slug = row[0] or "unknown"
        total_spend = abs(float(row[1]))  # Convert to positive
        txn_count = int(row[2])
        monthly_avg = total_spend / months

        # Create readable label from slug
        category_label = category_slug.replace("_", " ").replace(".", " › ").title()

        averages.append(
            DemoCategoryAverage(
                category_slug=category_slug,
                category_label=category_label,
                monthly_avg=round(monthly_avg, 2),
                txn_count=txn_count,
            )
        )

    return averages

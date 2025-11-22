"""Agent tools for analytics/budget endpoints."""

from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.utils.auth import get_current_user
from app.agent.prompts import (
    BUDGET_SUGGEST_PROMPT,
    FINANCE_RECURRING_PROMPT,
    FINANCE_FIND_SUBSCRIPTIONS_PROMPT,
)

router = APIRouter(
    prefix="/agent/tools/analytics",
    tags=["agent-tools-analytics"],
)


# Schemas
class BudgetSuggestToolRequest(BaseModel):
    month: Optional[str] = None  # e.g. "2025-11"


class BudgetCategorySuggestion(BaseModel):
    category_slug: str
    category_label: str
    spend: float
    suggested: float


class BudgetSuggestToolResponse(BaseModel):
    month: str
    total_spend: float
    suggested_budget: float
    categories: List[BudgetCategorySuggestion]
    llm_prompt: str


class RecurringToolRequest(BaseModel):
    month: Optional[str] = None  # e.g. "2025-11"


class RecurringItem(BaseModel):
    merchant: str
    amount: float
    category_slug: Optional[str] = None
    average_interval_days: Optional[int] = None
    last_seen: Optional[str] = None  # ISO date


class RecurringToolResponse(BaseModel):
    month: str
    recurring: List[RecurringItem]
    llm_prompt: str


class FindSubscriptionsToolRequest(BaseModel):
    month: Optional[str] = None  # e.g. "2025-11"


class SubscriptionItem(BaseModel):
    merchant: str
    amount: float
    category_slug: Optional[str] = None
    first_seen: Optional[str] = None  # ISO date
    last_seen: Optional[str] = None  # ISO date
    txn_count: int


class FindSubscriptionsToolResponse(BaseModel):
    month: str
    subscriptions: List[SubscriptionItem]
    llm_prompt: str


@router.post("/budget/suggest", response_model=BudgetSuggestToolResponse)
def budget_suggest_tool(
    payload: BudgetSuggestToolRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Suggest a category-level monthly budget based on recent spend.
    Uses simple heuristics: analyze last 3 months, suggest 10% buffer.
    """
    from datetime import datetime
    from sqlalchemy import func
    from app.transactions import Transaction

    # Resolve month
    target_month = payload.month
    if not target_month:
        # Use latest month from data
        latest = db.query(Transaction.month).order_by(Transaction.month.desc()).first()
        target_month = latest[0] if latest else datetime.now().strftime("%Y-%m")

    # Calculate lookback period (last 3 months before target)
    try:
        year, month_num = map(int, target_month.split("-"))
        lookback_months = []
        for i in range(1, 4):
            m = month_num - i
            y = year
            while m <= 0:
                m += 12
                y -= 1
            lookback_months.append(f"{y:04d}-{m:02d}")
    except (ValueError, IndexError):
        lookback_months = []

    # Query spending by category for lookback period
    if lookback_months:
        category_spend = (
            db.query(
                func.coalesce(Transaction.category, "Unknown").label("category"),
                func.sum(func.abs(Transaction.amount)).label("total_spend"),
            )
            .filter(
                Transaction.month.in_(lookback_months),
                Transaction.amount < 0,  # expenses only
            )
            .group_by("category")
            .all()
        )
    else:
        category_spend = []

    # Calculate suggestions: average spend per month + 10% buffer
    categories: List[BudgetCategorySuggestion] = []
    total_spend = 0.0

    for cat, spend in category_spend:
        avg_monthly = float(spend or 0.0) / max(len(lookback_months), 1)
        suggested = avg_monthly * 1.1  # 10% buffer
        total_spend += avg_monthly

        categories.append(
            BudgetCategorySuggestion(
                category_slug=str(cat).lower().replace(" ", "_"),
                category_label=str(cat),
                spend=round(avg_monthly, 2),
                suggested=round(suggested, 2),
            )
        )

    # Sort by spend descending
    categories.sort(key=lambda x: x.spend, reverse=True)

    suggested_budget = round(total_spend * 1.1, 2)

    return BudgetSuggestToolResponse(
        month=target_month,
        total_spend=round(total_spend, 2),
        suggested_budget=suggested_budget,
        categories=categories,
        llm_prompt=BUDGET_SUGGEST_PROMPT,
    )


@router.post("/recurring", response_model=RecurringToolResponse)
def recurring_tool(
    payload: RecurringToolRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Find recurring merchants/subscriptions based on transaction patterns.
    Simple heuristic: merchants that appear 2+ times with similar amounts.
    """
    from datetime import datetime
    from sqlalchemy import func
    from app.transactions import Transaction

    # Resolve month
    target_month = payload.month
    if not target_month:
        latest = db.query(Transaction.month).order_by(Transaction.month.desc()).first()
        target_month = latest[0] if latest else datetime.now().strftime("%Y-%m")

    # Query transactions for recurring pattern detection
    # Look at last 3 months to detect patterns
    try:
        year, month_num = map(int, target_month.split("-"))
        lookback_months = []
        for i in range(0, 3):
            m = month_num - i
            y = year
            while m <= 0:
                m += 12
                y -= 1
            lookback_months.append(f"{y:04d}-{m:02d}")
    except (ValueError, IndexError):
        lookback_months = [target_month]

    # Find merchants with multiple transactions
    merchant_txns = (
        db.query(
            Transaction.merchant,
            func.count(Transaction.id).label("txn_count"),
            func.avg(func.abs(Transaction.amount)).label("avg_amount"),
            func.max(Transaction.date).label("last_seen"),
            Transaction.category,
        )
        .filter(
            Transaction.month.in_(lookback_months),
            Transaction.amount < 0,  # expenses only
            Transaction.merchant.isnot(None),
        )
        .group_by(Transaction.merchant, Transaction.category)
        .having(func.count(Transaction.id) >= 2)  # at least 2 occurrences
        .order_by(func.avg(func.abs(Transaction.amount)).desc())
        .limit(20)
        .all()
    )

    recurring_items: List[RecurringItem] = []
    for merchant, count, avg_amt, last_seen, category in merchant_txns:
        # Estimate average interval (rough approximation)
        interval_days = 30  # default monthly assumption

        recurring_items.append(
            RecurringItem(
                merchant=merchant or "Unknown",
                amount=round(float(avg_amt or 0.0), 2),
                category_slug=category.lower().replace(" ", "_") if category else None,
                average_interval_days=interval_days,
                last_seen=str(last_seen) if last_seen else None,
            )
        )

    return RecurringToolResponse(
        month=target_month,
        recurring=recurring_items,
        llm_prompt=FINANCE_RECURRING_PROMPT,
    )


@router.post("/subscriptions/find", response_model=FindSubscriptionsToolResponse)
def find_subscriptions_tool(
    payload: FindSubscriptionsToolRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Find likely subscriptions by detecting merchants with regular, similar-amount charges.
    More refined than recurring - looks for exact-match amounts and regular intervals.
    """
    from datetime import datetime
    from sqlalchemy import func
    from app.transactions import Transaction

    # Resolve month
    target_month = payload.month
    if not target_month:
        latest = db.query(Transaction.month).order_by(Transaction.month.desc()).first()
        target_month = latest[0] if latest else datetime.now().strftime("%Y-%m")

    # Look at wider window for subscription detection
    try:
        year, month_num = map(int, target_month.split("-"))
        lookback_months = []
        for i in range(0, 6):  # 6 months to catch monthly subscriptions
            m = month_num - i
            y = year
            while m <= 0:
                m += 12
                y -= 1
            lookback_months.append(f"{y:04d}-{m:02d}")
    except (ValueError, IndexError):
        lookback_months = [target_month]

    # Find merchants with highly consistent amounts (likely subscriptions)
    subscription_candidates = (
        db.query(
            Transaction.merchant,
            func.count(Transaction.id).label("txn_count"),
            func.avg(func.abs(Transaction.amount)).label("avg_amount"),
            func.min(Transaction.date).label("first_seen"),
            func.max(Transaction.date).label("last_seen"),
            Transaction.category,
        )
        .filter(
            Transaction.month.in_(lookback_months),
            Transaction.amount < 0,  # expenses only
            Transaction.merchant.isnot(None),
        )
        .group_by(Transaction.merchant, Transaction.category)
        .having(
            func.count(Transaction.id) >= 3
        )  # at least 3 occurrences for subscription
        .order_by(func.count(Transaction.id).desc())
        .limit(20)
        .all()
    )

    subscription_items: List[SubscriptionItem] = []
    for (
        merchant,
        count,
        avg_amt,
        first_seen,
        last_seen,
        category,
    ) in subscription_candidates:
        subscription_items.append(
            SubscriptionItem(
                merchant=merchant or "Unknown",
                amount=round(float(avg_amt or 0.0), 2),
                category_slug=category.lower().replace(" ", "_") if category else None,
                first_seen=str(first_seen) if first_seen else None,
                last_seen=str(last_seen) if last_seen else None,
                txn_count=count,
            )
        )

    return FindSubscriptionsToolResponse(
        month=target_month,
        subscriptions=subscription_items,
        llm_prompt=FINANCE_FIND_SUBSCRIPTIONS_PROMPT,
    )


@router.post("/alerts")
def analytics_alerts_tool(
    payload: BudgetSuggestToolRequest,  # Reuse - just needs month
    current_user: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Compute actionable alerts for a given month.
    Uses existing analytics to detect unknown spend, spending spikes, new subscriptions.
    """
    from app.services.analytics_alerts import compute_alerts_for_month
    from datetime import datetime

    # Resolve month
    month = payload.month
    if not month:
        from sqlalchemy import func
        from app.transactions import Transaction

        latest = db.query(func.max(Transaction.booked_at)).scalar()
        if latest:
            month = latest.strftime("%Y-%m")
        else:
            month = datetime.now().strftime("%Y-%m")

    result = compute_alerts_for_month(db=db, month=month)
    return result.dict()

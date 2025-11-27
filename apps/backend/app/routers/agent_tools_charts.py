from typing import List, Dict, Optional, Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, conint  # type: ignore[attr-defined]
from sqlalchemy import func, case, desc, asc
from sqlalchemy.orm import Session

from app.db import get_db
from app.transactions import Transaction
from app.deps.auth_guard import get_current_user_id
from app.agent.prompts import (
    FINANCE_QUICK_RECAP_PROMPT,
    ANALYTICS_TRENDS_PROMPT,
)

router = APIRouter(prefix="/agent/tools/charts", tags=["agent-tools:charts"])

# ---------- Pydantic Schemas ----------


class MonthParam(BaseModel):
    month: str = Field(..., description="YYYY-MM")


class SummaryBody(MonthParam):
    include_daily: bool = True
    demo: bool = Field(False, description="Use demo user data instead of current user")


class SummaryPoint(BaseModel):
    date: str
    inflow: float
    outflow: float
    net: float


class SummaryResp(BaseModel):
    month: str
    total_inflows: float
    total_outflows: float
    net: float
    daily: List[SummaryPoint]
    llm_prompt: Optional[str] = None


class MerchantsBody(MonthParam):
    top_n: conint(ge=1, le=50) = 10
    demo: bool = Field(False, description="Use demo user data instead of current user")


class MerchantItem(BaseModel):
    merchant_key: str
    label: str  # Normalized display name
    total: float  # Total spend amount
    count: int  # Transaction count
    statement_examples: List[str] = Field(default_factory=list)
    category: Optional[str] = None  # Learned category from merchant cache


class MerchantsResp(BaseModel):
    month: str
    items: List[MerchantItem]


class FlowsBody(MonthParam):
    top_merchants: conint(ge=1, le=50) = 10
    top_categories: conint(ge=1, le=50) = 10
    demo: bool = Field(False, description="Use demo user data instead of current user")


class FlowEdge(BaseModel):
    source: str
    target: str
    amount: float


class FlowsResp(BaseModel):
    month: str
    edges: List[FlowEdge]


class TrendsBody(BaseModel):
    months: Optional[List[str]] = Field(
        None, description="Explicit YYYY-MM list; if absent, we infer from data."
    )
    window: conint(ge=1, le=24) = 6
    order: Literal["asc", "desc"] = "asc"  # chronological order
    demo: bool = Field(False, description="Use demo user data instead of current user")


class TrendPoint(BaseModel):
    month: str
    inflow: float
    outflow: float
    net: float


class TrendsResp(BaseModel):
    months: List[str]
    series: List[TrendPoint]
    llm_prompt: Optional[str] = None


# ---------- Helpers ----------


def _unknown_cat():
    return (
        (Transaction.category.is_(None))
        | (func.trim(Transaction.category) == "")
        | (func.lower(Transaction.category) == "unknown")
    )


def _abs_outflow_sum():
    # Sum of negative amounts, returned as positive spend
    return func.sum(
        func.abs(case((Transaction.amount < 0, Transaction.amount), else_=0.0))
    )


def _inflow_sum():
    return func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0.0))


# ---------- Endpoints ----------


@router.post("/summary", response_model=SummaryResp)
def charts_summary(
    body: SummaryBody,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> SummaryResp:
    from app.core.demo import resolve_user_for_mode

    effective_user_id, _ = resolve_user_for_mode(user_id, body.demo)

    # Totals for the month
    totals = (
        db.query(
            _inflow_sum().label("inflow"),
            _abs_outflow_sum().label("outflow"),
            func.sum(Transaction.amount).label("net_raw"),
        )
        .filter(
            Transaction.user_id == effective_user_id, Transaction.month == body.month
        )
        .one()
    )
    total_in = float(totals.inflow or 0.0)
    total_out = float(totals.outflow or 0.0)
    net = float(totals.net_raw or 0.0)

    daily: List[SummaryPoint] = []
    if body.include_daily:
        rows = (
            db.query(
                Transaction.date.label("d"),
                _inflow_sum().label("inflow"),
                _abs_outflow_sum().label("outflow"),
                func.sum(Transaction.amount).label("net_raw"),
            )
            .filter(
                Transaction.user_id == effective_user_id,
                Transaction.month == body.month,
            )
            .group_by(Transaction.date)
            .order_by(asc(Transaction.date))
            .all()
        )
        for r in rows:
            inflow = float(r.inflow or 0.0)
            outflow = float(r.outflow or 0.0)
            net_day = float(r.net_raw or 0.0)
            daily.append(
                SummaryPoint(date=str(r.d), inflow=inflow, outflow=outflow, net=net_day)
            )

    return SummaryResp(
        month=body.month,
        total_inflows=total_in,
        total_outflows=total_out,
        net=net,
        daily=daily,
        llm_prompt=FINANCE_QUICK_RECAP_PROMPT,
    )


@router.post("/merchants", response_model=MerchantsResp)
def charts_merchants(
    body: MerchantsBody,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> MerchantsResp:
    """
    Get top merchants with brand-aware normalization and learned categories.
    Uses merchant cache (Redis) to remember merchant categorization.
    """
    from collections import defaultdict
    from typing import Any, Dict
    from app.services.charts_data import canonical_and_label
    from app.redis_client import redis
    from app.services.merchant_cache import learn_merchant
    from app.core.demo import resolve_user_for_mode

    effective_user_id, _ = resolve_user_for_mode(user_id, body.demo)
    redis_client = redis()

    # Fetch all expense transactions for the month (with description for learning)
    txns = (
        db.query(Transaction.merchant, Transaction.amount, Transaction.description)
        .filter(
            Transaction.user_id == effective_user_id,
            Transaction.month == body.month,
            Transaction.amount < 0,
            ~Transaction.pending,
        )
        .all()
    )

    # Aggregate using merchant cache (learns categories)
    buckets: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {
            "label": "",
            "total": 0.0,
            "count": 0,
            "statement_examples": set(),
            "category": None,
        }
    )

    for raw_merchant, amount, description in txns:
        raw = raw_merchant or "unknown"

        # Use merchant cache if available, fallback to canonical_and_label
        if redis_client:
            hint = learn_merchant(redis_client, db, raw, description or raw, amount)
            key = hint.normalized_name
            label = hint.display_name
            category = hint.category
        else:
            key, label = canonical_and_label(raw)
            category = None

        b = buckets[key]
        b["label"] = label
        b["total"] = float(b["total"]) + abs(float(amount or 0.0))
        b["count"] = int(b["count"]) + 1
        b["statement_examples"].add(raw)  # type: ignore
        if category and not b["category"]:
            b["category"] = category

    # Convert to list and sort by total spend
    items_list = []
    for key, b in buckets.items():
        items_list.append(
            MerchantItem(
                merchant_key=key,
                label=b["label"],
                total=b["total"],
                count=b["count"],
                statement_examples=sorted(b["statement_examples"])[:3],
                category=b["category"],
            )
        )

    items_list.sort(key=lambda r: r.total, reverse=True)
    top_items = items_list[: body.top_n]

    return MerchantsResp(month=body.month, items=top_items)


@router.post("/flows", response_model=FlowsResp)
def charts_flows(
    body: FlowsBody,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> FlowsResp:
    """
    Produce simple Sankey-like edges for outflows:
      Category -> Merchant with 'amount' = spend for that pair in the month.
    This is agent-friendly and deterministic.
    """
    from app.core.demo import resolve_user_for_mode

    effective_user_id, _ = resolve_user_for_mode(user_id, body.demo)

    rows = (
        db.query(
            func.coalesce(func.nullif(Transaction.category, ""), "Unknown").label(
                "category"
            ),
            func.coalesce(func.nullif(Transaction.merchant, ""), "Unknown").label(
                "merchant"
            ),
            _abs_outflow_sum().label("spend"),
        )
        .filter(
            Transaction.user_id == effective_user_id, Transaction.month == body.month
        )
        .group_by("category", "merchant")
        .order_by(desc("spend"))
        .all()
    )

    # Keep only the top X merchants and top Y categories by spend contribution
    # Build totals for ranking
    by_merchant: Dict[str, float] = {}
    by_category: Dict[str, float] = {}
    for r in rows:
        spend = float(r.spend or 0.0)
        if spend <= 0:
            continue
        by_merchant[r.merchant] = by_merchant.get(r.merchant, 0.0) + spend
        by_category[r.category] = by_category.get(r.category, 0.0) + spend

    top_merchs = {
        m
        for m, _ in sorted(by_merchant.items(), key=lambda kv: kv[1], reverse=True)[
            : body.top_merchants
        ]
    }
    top_cats = {
        c
        for c, _ in sorted(by_category.items(), key=lambda kv: kv[1], reverse=True)[
            : body.top_categories
        ]
    }

    edges: List[FlowEdge] = []
    for r in rows:
        spend = float(r.spend or 0.0)
        if spend <= 0:
            continue
        if (r.merchant in top_merchs) and (r.category in top_cats):
            edges.append(FlowEdge(source=r.category, target=r.merchant, amount=spend))

    return FlowsResp(month=body.month, edges=edges)


@router.post("/spending_trends", response_model=TrendsResp)  # legacy underscore
@router.post("/spending-trends", response_model=TrendsResp)  # canonical dashed
async def spending_trends_post(
    body: TrendsBody,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> TrendsResp:
    from app.core.demo import resolve_user_for_mode

    effective_user_id, _ = resolve_user_for_mode(user_id, body.demo)

    # Determine which months to include
    months: List[str]
    if body.months:
        months = list(dict.fromkeys(body.months))  # dedupe keep order
    else:
        rows = (
            db.query(Transaction.month)
            .filter(Transaction.user_id == effective_user_id)
            .group_by(Transaction.month)
            .order_by(desc(Transaction.month))
            .limit(body.window)
            .all()
        )
        months = [r[0] for r in rows]
        months.sort(reverse=False if body.order == "asc" else True)

    # Aggregate per month
    series_rows = (
        db.query(
            Transaction.month.label("m"),
            _inflow_sum().label("inflow"),
            _abs_outflow_sum().label("outflow"),
            func.sum(Transaction.amount).label("net_raw"),
        )
        .filter(Transaction.user_id == effective_user_id, Transaction.month.in_(months))
        .group_by(Transaction.month)
        .all()
    )

    series_map: Dict[str, TrendPoint] = {}
    for r in series_rows:
        inflow = float(r.inflow or 0.0)
        outflow = float(r.outflow or 0.0)
        net = float(r.net_raw or 0.0)
        series_map[r.m] = TrendPoint(month=r.m, inflow=inflow, outflow=outflow, net=net)

    # Return in requested order; missing months default to zeros
    ordered = months if body.order == "asc" else list(reversed(months))
    series = [
        series_map.get(m, TrendPoint(month=m, inflow=0.0, outflow=0.0, net=0.0))
        for m in ordered
    ]

    return TrendsResp(months=ordered, series=series, llm_prompt=ANALYTICS_TRENDS_PROMPT)


@router.get("/spending_trends", include_in_schema=False, response_model=TrendsResp)
@router.get("/spending-trends", include_in_schema=False, response_model=TrendsResp)
async def spending_trends_get_compat(
    months: Optional[str] = None,
    window: int = 6,
    order: Literal["asc", "desc"] = "asc",
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> TrendsResp:
    body = TrendsBody(
        months=[m for m in (months or "").split(",") if m] or None,
        window=window,
        order=order,
        demo=False,
    )
    return await spending_trends_post(body, user_id, db)


# ---------- Demo Finance Tool ----------


class DemoOverviewBody(BaseModel):
    """Request body for demo finance overview."""

    months: int = Field(6, ge=1, le=12)
    user_id: Optional[int] = None  # For internal use; normally from auth context


class DemoCategoryItem(BaseModel):
    """Category spending average for demo data."""

    category_slug: str
    category_label: str
    monthly_avg: float
    txn_count: int


class DemoOverviewResp(BaseModel):
    """Response for demo finance overview."""

    categories: List[DemoCategoryItem]
    months_analyzed: int
    total_categories: int


@router.post("/demo-overview", response_model=DemoOverviewResp)
async def demo_overview_post(
    body: DemoOverviewBody,
    db: Session = Depends(get_db),
) -> DemoOverviewResp:
    """
    Get category spending averages for demo data.

    This endpoint is designed for demo users to get an overview of their
    sample data spending patterns by category.

    Returns monthly averages for each category over the specified time window.
    """
    from app.agent.finance_utils import get_demo_category_monthly_averages
    from app.config import settings

    # For now, use user_id from body if provided, otherwise try to get from context
    # In production, this would come from authenticated user context
    user_id = body.user_id
    if user_id is None:
        # Fallback: try to get demo user from database
        from app.orm_models import User

        demo_user = (
            db.query(User).filter(User.email == settings.DEMO_USER_EMAIL).first()
        )
        if demo_user:
            user_id = demo_user.id
        else:
            # No demo user found, return empty result
            return DemoOverviewResp(
                categories=[],
                months_analyzed=body.months,
                total_categories=0,
            )

    # Get category averages
    averages = get_demo_category_monthly_averages(
        db=db,
        user_id=user_id,
        months=body.months,
    )

    # Convert to response format
    categories = [
        DemoCategoryItem(
            category_slug=avg.category_slug,
            category_label=avg.category_label,
            monthly_avg=avg.monthly_avg,
            txn_count=avg.txn_count,
        )
        for avg in averages
    ]

    return DemoOverviewResp(
        categories=categories,
        months_analyzed=body.months,
        total_categories=len(categories),
    )

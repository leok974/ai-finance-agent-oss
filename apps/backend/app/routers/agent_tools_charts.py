from typing import List, Dict, Optional, Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, conint
from sqlalchemy import func, case, desc, asc
from sqlalchemy.orm import Session

from app.db import get_db
from app.transactions import Transaction

router = APIRouter(prefix="/agent/tools/charts", tags=["agent-tools:charts"])

# ---------- Pydantic Schemas ----------


class MonthParam(BaseModel):
    month: str = Field(..., description="YYYY-MM")


class SummaryBody(MonthParam):
    include_daily: bool = True


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


class MerchantsBody(MonthParam):
    top_n: conint(ge=1, le=50) = 10


class MerchantItem(BaseModel):
    merchant: str
    spend: float
    txns: int


class MerchantsResp(BaseModel):
    month: str
    items: List[MerchantItem]


class FlowsBody(MonthParam):
    top_merchants: conint(ge=1, le=50) = 10
    top_categories: conint(ge=1, le=50) = 10


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


class TrendPoint(BaseModel):
    month: str
    inflow: float
    outflow: float
    net: float


class TrendsResp(BaseModel):
    months: List[str]
    series: List[TrendPoint]


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
def charts_summary(body: SummaryBody, db: Session = Depends(get_db)) -> SummaryResp:
    # Totals for the month
    totals = (
        db.query(
            _inflow_sum().label("inflow"),
            _abs_outflow_sum().label("outflow"),
            func.sum(Transaction.amount).label("net_raw"),
        )
        .filter(Transaction.month == body.month)
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
            .filter(Transaction.month == body.month)
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
    )


@router.post("/merchants", response_model=MerchantsResp)
def charts_merchants(
    body: MerchantsBody, db: Session = Depends(get_db)
) -> MerchantsResp:
    q = (
        db.query(
            func.coalesce(func.nullif(Transaction.merchant, ""), "Unknown").label(
                "merchant"
            ),
            _abs_outflow_sum().label("spend"),
            func.sum(case((Transaction.amount != 0, 1), else_=0)).label("txns"),
        )
        .filter(Transaction.month == body.month)
        .group_by("merchant")
        .order_by(desc("spend"))
        .limit(body.top_n)
    )
    items = [
        MerchantItem(
            merchant=row.merchant,
            spend=float(row.spend or 0.0),
            txns=int(row.txns or 0),
        )
        for row in q.all()
        if (row.spend or 0.0) > 0
    ]
    return MerchantsResp(month=body.month, items=items)


@router.post("/flows", response_model=FlowsResp)
def charts_flows(body: FlowsBody, db: Session = Depends(get_db)) -> FlowsResp:
    """
    Produce simple Sankey-like edges for outflows:
      Category -> Merchant with 'amount' = spend for that pair in the month.
    This is agent-friendly and deterministic.
    """
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
        .filter(Transaction.month == body.month)
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
    body: TrendsBody, db: Session = Depends(get_db)
) -> TrendsResp:
    # Determine which months to include
    months: List[str]
    if body.months:
        months = list(dict.fromkeys(body.months))  # dedupe keep order
    else:
        rows = (
            db.query(Transaction.month)
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
        .filter(Transaction.month.in_(months))
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

    return TrendsResp(months=ordered, series=series)


@router.get("/spending_trends", include_in_schema=False, response_model=TrendsResp)
@router.get("/spending-trends", include_in_schema=False, response_model=TrendsResp)
async def spending_trends_get_compat(
    months: Optional[str] = None,
    window: int = 6,
    order: Literal["asc", "desc"] = "asc",
    db: Session = Depends(get_db),
) -> TrendsResp:
    body = TrendsBody(
        months=[m for m in (months or "").split(",") if m] or None,
        window=window,
        order=order,
    )
    return await spending_trends_post(body, db)

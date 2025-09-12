from typing import Dict, List, Optional, Literal
from dataclasses import asdict, dataclass
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, conint, confloat
from sqlalchemy import func, case, desc
from sqlalchemy.orm import Session

from app.db import get_db
from app.transactions import Transaction

router = APIRouter(prefix="/agent/tools/budget", tags=["agent-tools:budget"])


# ---------- Schemas ----------
class MonthParam(BaseModel):
    month: str = Field(..., description="YYYY-MM")
    top_n: conint(ge=1, le=50) = 5


class BudgetCheckBody(BaseModel):
    month: str = Field(..., description="YYYY-MM")
    # category -> monthly limit (positive number, e.g., 300 means $300 max spend for that category)
    limits: Dict[str, confloat(ge=0)] = Field(default_factory=dict, description="Mapping category -> monthly limit")
    include_unknown: bool = False  # if True, treat Unknown as a budgeted category when provided


class CategorySpend(BaseModel):
    category: str
    spend: float  # absolute outflow (positive number)
    txns: int


class MerchantSpend(BaseModel):
    merchant: str
    spend: float
    txns: int


class SummaryResponse(BaseModel):
    month: str
    total_outflows: float  # sum of negative amounts as positive dollars
    total_inflows: float   # sum of positive amounts
    net: float             # inflows - outflows
    unknown_count: int
    by_category: List[CategorySpend]
    top_merchants: List[MerchantSpend]


class BudgetItem(BaseModel):
    category: str
    limit: float
    spend: float
    remaining: float
    utilization: float  # 0..1, capped (no inf)


class BudgetCheckResponse(BaseModel):
    month: str
    items: List[BudgetItem]
    totals: Dict[str, float]  # {spend, limit, remaining, utilization}


# ---------- Helpers ----------
def _unknown_cond():
    # None / '' / 'Unknown' (case-insensitive) are considered unknown
    return (Transaction.category.is_(None)) | (func.trim(Transaction.category) == "") | (func.lower(Transaction.category) == "unknown")


def _month_filter(q, month: Optional[str]):
    if month:
        q = q.filter(Transaction.month == month)
    return q


def _abs_outflow():
    # Convert negative amounts to positive 'spend' for aggregation
    return func.sum(func.abs(case((Transaction.amount < 0, Transaction.amount), else_=0.0)))


def _abs_inflow():
    # Positive inflows
    return func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0.0))


# ---------- Endpoints ----------
@router.post("/summary", response_model=SummaryResponse)
def budget_summary(body: MonthParam, db: Session = Depends(get_db)) -> SummaryResponse:
    # Totals
    base = _month_filter(db.query(
        _abs_outflow().label("outflows"),
        _abs_inflow().label("inflows"),
        func.sum(Transaction.amount).label("net_raw"),
        func.sum(case((_unknown_cond(), 1), else_=0)).label("unknowns")
    ), body.month)

    totals = base.one()
    total_out = float(totals.outflows or 0.0)
    total_in = float(totals.inflows or 0.0)
    net = float((totals.net_raw or 0.0))
    unknown_count = int(totals.unknowns or 0)

    # By category (outflows only)
    cat_q = _month_filter(
        db.query(
            func.coalesce(func.nullif(Transaction.category, ""), "Unknown").label("category"),
            _abs_outflow().label("spend"),
            func.sum(case((Transaction.amount != 0, 1), else_=0)).label("txns"),
        ).group_by("category"),
        body.month,
    ).order_by(desc("spend")).limit(body.top_n)

    by_category = [
        CategorySpend(category=row.category, spend=float(row.spend or 0.0), txns=int(row.txns or 0))
        for row in cat_q.all()
        if (row.spend or 0.0) > 0
    ]

    # Top merchants (outflows only)
    merch_q = _month_filter(
        db.query(
            func.coalesce(func.nullif(Transaction.merchant, ""), "Unknown").label("merchant"),
            _abs_outflow().label("spend"),
            func.sum(case((Transaction.amount != 0, 1), else_=0)).label("txns"),
        ).group_by("merchant"),
        body.month,
    ).order_by(desc("spend")).limit(body.top_n)

    top_merchants = [
        MerchantSpend(merchant=row.merchant, spend=float(row.spend or 0.0), txns=int(row.txns or 0))
        for row in merch_q.all()
        if (row.spend or 0.0) > 0
    ]

    return SummaryResponse(
        month=body.month,
        total_outflows=total_out,
        total_inflows=total_in,
        net=total_in - total_out,
        unknown_count=unknown_count,
        by_category=by_category,
        top_merchants=top_merchants,
    )


@router.post("/check", response_model=BudgetCheckResponse)
def budget_check(body: BudgetCheckBody, db: Session = Depends(get_db)) -> BudgetCheckResponse:
    # Spend by category for the month (outflows only)
    q = _month_filter(
        db.query(
            func.coalesce(func.nullif(Transaction.category, ""), "Unknown").label("category"),
            _abs_outflow().label("spend"),
        ).group_by("category"),
        body.month,
    )
    cat_spend = {row.category: float(row.spend or 0.0) for row in q.all() if (row.spend or 0.0) > 0}

    items: List[BudgetItem] = []
    total_limit = 0.0
    total_spend = 0.0

    for cat, limit in body.limits.items():
        spend = cat_spend.get(cat, 0.0)
        remaining = float(limit) - spend
        if float(limit) > 0:
            utilization = spend / float(limit)
        else:
            utilization = 1.0 if spend > 0 else 0.0
        items.append(BudgetItem(
            category=cat,
            limit=float(limit),
            spend=spend,
            remaining=remaining,
            utilization=utilization,
        ))
        total_limit += float(limit)
        total_spend += spend

    # Optionally include "Unknown" as budgeted if provided in limits or requested explicitly
    if body.include_unknown and "Unknown" not in body.limits:
        unk_spend = cat_spend.get("Unknown", 0.0)
        items.append(BudgetItem(
            category="Unknown",
            limit=0.0,
            spend=unk_spend,
            remaining=-unk_spend,
            utilization=1.0 if unk_spend > 0 else 0.0,
        ))
        total_spend += unk_spend

    totals_util = (total_spend / total_limit) if total_limit > 0 else (1.0 if total_spend > 0 else 0.0)
    totals = {
        "spend": total_spend,
        "limit": total_limit,
        "remaining": total_limit - total_spend,
        "utilization": totals_util,
    }

    # Stable order for agent-friendliness: highest utilization first
    items.sort(key=lambda x: (x.utilization, x.spend), reverse=True)

    return BudgetCheckResponse(month=body.month, items=items, totals=totals)

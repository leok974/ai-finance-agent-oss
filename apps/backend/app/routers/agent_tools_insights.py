from typing import List, Optional, Literal, Dict, Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, conint, confloat
from sqlalchemy import func, case, desc
from sqlalchemy.orm import Session

from app.db import get_db
from app.orm_models import Transaction

router = APIRouter(prefix="/agent/tools/insights", tags=["agent-tools:insights"])

Severity = Literal["info", "warn", "critical"]
Kind = Literal[
    "summary",
    "unknown_spend",
    "top_categories",
    "top_merchants",
    "large_transaction",
]

class InsightsRequest(BaseModel):
    month: str = Field(..., description="YYYY-MM")
    top_n: conint(ge=1, le=10) = 3
    # Consider any single transaction with abs(amount) >= large_txn_threshold as 'large'
    large_txn_threshold: confloat(ge=0) = 200.0
    include_unknown: bool = True

class InsightItem(BaseModel):
    id: str
    kind: Kind
    title: str
    detail: str
    severity: Severity = "info"
    metrics: Dict[str, Any] = Field(default_factory=dict)

class InsightsResponse(BaseModel):
    month: str
    insights: List[InsightItem]

def _unknown_cond():
    return (
        (Transaction.category.is_(None))
        | (func.trim(Transaction.category) == "")
        | (func.lower(Transaction.category) == "unknown")
    )

def _month_q(db: Session, month: str):
    return db.query(Transaction).filter(Transaction.month == month)

def _abs_outflow_sum():
    # Sum of negative amounts, returned as positive 'spend'
    return func.sum(func.abs(case((Transaction.amount < 0, Transaction.amount), else_=0.0)))

def _inflow_sum():
    return func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0.0))

@router.post("/summary", response_model=InsightsResponse)
def insights_summary(body: InsightsRequest, db: Session = Depends(get_db)) -> InsightsResponse:
    insights: List[InsightItem] = []

    # Overall summary
    sums = (
        db.query(
            _abs_outflow_sum().label("outflow"),
            _inflow_sum().label("inflow"),
            func.sum(Transaction.amount).label("net_raw"),
            func.sum(case((_unknown_cond(), 1), else_=0)).label("unknown_count"),
        )
        .filter(Transaction.month == body.month)
        .one()
    )
    total_out = float(sums.outflow or 0.0)
    total_in = float(sums.inflow or 0.0)
    net = float(sums.net_raw or 0.0)

    insights.append(
        InsightItem(
            id="summary",
            kind="summary",
            title=f"Summary for {body.month}",
            detail=f"Inflows ${total_in:.2f}, outflows ${total_out:.2f}, net ${net:.2f}",
            severity="info",
            metrics={"inflows": total_in, "outflows": total_out, "net": net, "unknown_count": int(sums.unknown_count or 0)},
        )
    )

    # Unknown spend (optional hint)
    if body.include_unknown and (sums.unknown_count or 0) > 0:
        unk_spend = (
            db.query(_abs_outflow_sum())
            .filter(Transaction.month == body.month)
            .filter(_unknown_cond())
            .scalar()
        ) or 0.0
        if unk_spend > 0:
            insights.append(
                InsightItem(
                    id="unknown-spend",
                    kind="unknown_spend",
                    title="Uncategorized/Unknown spending detected",
                    detail=f"You have ${unk_spend:.2f} of spend without a category. Consider labeling for better budgets.",
                    severity="warn",
                    metrics={"unknown_spend": float(unk_spend)},
                )
            )

    # Top categories (by outflow)
    cat_rows = (
        db.query(
            func.coalesce(func.nullif(Transaction.category, ""), "Unknown").label("category"),
            _abs_outflow_sum().label("spend"),
        )
        .filter(Transaction.month == body.month)
        .group_by("category")
        .order_by(desc("spend"))
        .limit(body.top_n)
        .all()
    )
    cat_items = [
        {"category": r.category, "spend": float(r.spend or 0.0)}
        for r in cat_rows
        if (r.spend or 0.0) > 0
    ]
    if cat_items:
        insights.append(
            InsightItem(
                id="top-categories",
                kind="top_categories",
                title=f"Top {len(cat_items)} categories by spend",
                detail=", ".join(f"{c['category']}: ${c['spend']:.2f}" for c in cat_items),
                severity="info",
                metrics={"items": cat_items},
            )
        )

    # Top merchants (by outflow)
    merch_rows = (
        db.query(
            func.coalesce(func.nullif(Transaction.merchant, ""), "Unknown").label("merchant"),
            _abs_outflow_sum().label("spend"),
        )
        .filter(Transaction.month == body.month)
        .group_by("merchant")
        .order_by(desc("spend"))
        .limit(body.top_n)
        .all()
    )
    merch_items = [
        {"merchant": r.merchant, "spend": float(r.spend or 0.0)}
        for r in merch_rows
        if (r.spend or 0.0) > 0
    ]
    if merch_items:
        insights.append(
            InsightItem(
                id="top-merchants",
                kind="top_merchants",
                title=f"Top {len(merch_items)} merchants by spend",
                detail=", ".join(f"{m['merchant']}: ${m['spend']:.2f}" for m in merch_items),
                severity="info",
                metrics={"items": merch_items},
            )
        )

    # Large transactions
    large_txns = (
        _month_q(db, body.month)
        .filter(func.abs(Transaction.amount) >= body.large_txn_threshold)
        .order_by(desc(func.abs(Transaction.amount)))
        .limit(10)
        .all()
    )
    if large_txns:
        items = [
            {
                "id": t.id,
                "date": str(t.date),
                "merchant": t.merchant or "Unknown",
                "amount": float(t.amount),
                "category": (t.category or "Unknown"),
            }
            for t in large_txns
        ]
        insights.append(
            InsightItem(
                id="large-transactions",
                kind="large_transaction",
                title=f"{len(items)} large transaction(s) ≥ ${body.large_txn_threshold:.2f}",
                detail="; ".join(f"{i['merchant']} ${abs(i['amount']):.2f} on {i['date']}" for i in items),
                severity="warn",
                metrics={"threshold": float(body.large_txn_threshold), "items": items},
            )
        )

    return InsightsResponse(month=body.month, insights=insights)

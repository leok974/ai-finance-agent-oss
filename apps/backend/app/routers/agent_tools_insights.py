from typing import List, Optional, Literal, Dict, Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.db import get_db
from app.transactions import Transaction
from app.services.insights_expanded import build_expanded_insights

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
    top_n: int = Field(3, ge=1, le=10)
    # Consider any single transaction with abs(amount) >= large_txn_threshold as 'large'
    large_txn_threshold: float = Field(200.0, ge=0)
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
    return func.sum(
        func.abs(case((Transaction.amount < 0, Transaction.amount), else_=0.0))
    )


def _inflow_sum():
    return func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0.0))


"""
Deprecated /summary route has been removed after migration to /expanded.
Frontends must call /agent/tools/insights/expanded instead.
"""


# --- Expanded insights (agent tools) -----------------------------------------
class ExpandedIn(BaseModel):
    month: Optional[str] = None
    large_limit: Optional[int] = 10


@router.post("/expanded")
def insights_expanded(
    body: ExpandedIn, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    return build_expanded_insights(
        db=db, month=body.month, large_limit=body.large_limit or 10
    )


# --- Minimal helper for /agent/chat resilience --------------------------------
# These are permissive shapes/utilities that allow the chat endpoint to
# normalize whatever "insights" payload exists, without crashing the request.
from typing import (
    Any as _Any,
    Optional as _Optional,
    List as _List,
)  # aliases to avoid shadowing


class ExpandedBody(BaseModel):
    summary: str = ""
    bullets: _List[str] = []
    sources: _List[str] = []


def expand(raw: _Optional[dict[str, _Any]] = None) -> ExpandedBody:
    if not raw:
        return ExpandedBody()

    summary = str(raw.get("summary") or raw.get("title") or raw.get("headline") or "")

    bullets = raw.get("bullets") or raw.get("items") or raw.get("points") or []
    if not isinstance(bullets, list):
        bullets = [str(bullets)]
    bullets = [str(x) for x in bullets]

    sources = raw.get("sources") or []
    if not isinstance(sources, list):
        sources = [str(sources)]
    sources = [str(x) for x in sources]

    return ExpandedBody(summary=summary, bullets=bullets, sources=sources)


__all__ = [
    # existing router symbols are exported via FastAPI router registration
    "ExpandedBody",
    "expand",
]

from __future__ import annotations
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session
import os
from app.db import get_db
from app.orm_models import Transaction
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent/tools/suggestions", tags=["suggestions"])

SUGGESTIONS_ENABLED = os.getenv("SUGGESTIONS_ENABLED", "0") in (
    "1",
    "true",
    "True",
    "yes",
)


class Suggestion(BaseModel):
    kind: str = Field("categorize", description="Type of suggested rule")
    merchant: str
    suggest_category: str
    confidence: float = Field(..., ge=0, le=1)  # 0..1
    support: int = Field(..., ge=1)  # number of txns behind the suggestion
    example_txn_id: int | None = None
    month: str | None = None


class SuggestionsRequest(BaseModel):
    month: str | None = (
        None  # YYYY-MM; if absent, returns empty items with meta.reason="month_missing"
    )
    window_months: int = Field(3, ge=1, le=12)
    min_support: int = Field(3, ge=2, le=100)
    min_share: float = Field(0.6, ge=0.5, le=1)
    limit: int = Field(20, ge=1, le=100)


class SuggestionsResponse(BaseModel):
    items: list[Suggestion]
    # Optional auxiliary information for clients; ignored by older callers
    meta: dict[str, str] | None = None


def _latest_month(db: Session) -> str | None:
    q = select(func.to_char(func.max(Transaction.date), "YYYY-MM"))
    return db.execute(q).scalar()


@router.post("", response_model=SuggestionsResponse, response_model_exclude_none=True)
def compute_suggestions(
    body: SuggestionsRequest, db: Session = Depends(get_db)
) -> SuggestionsResponse:
    if not SUGGESTIONS_ENABLED:
        return SuggestionsResponse(items=[])

    # If the request does not specify a month, return an empty set with a meta reason.
    # This keeps the 200 response while making the reason explicit for clients.
    if not body.month:
        return SuggestionsResponse(items=[], meta={"reason": "month_missing"})

    month = body.month

    # Compute the earliest month to consider based on window_months using
    # simple Python arithmetic to avoid dialect-specific SQL functions.
    try:
        dt = datetime.strptime(month, "%Y-%m")
        # Shift back (window_months - 1) months
        m_off = body.window_months - 1
        y = dt.year
        m = dt.month
        total = (y * 12 + (m - 1)) - m_off
        start_y = total // 12
        start_m = (total % 12) + 1
        start_month = f"{start_y:04d}-{start_m:02d}"
    except Exception:
        # If parsing fails, fall back to using the same month only
        start_month = month

    # Use the stored Transaction.month (YYYY-MM) for portability across DBs
    unknown_pred = and_(
        Transaction.month == month, func.coalesce(Transaction.category, "") == ""
    )

    q_known = (
        select(Transaction.merchant, Transaction.category, func.count().label("n"))
        .where(
            Transaction.category.isnot(None),
            func.coalesce(Transaction.category, "") != "",
            Transaction.month >= start_month,
        )
        .group_by(Transaction.merchant, Transaction.category)
    ).subquery()

    q_unknown = (
        select(Transaction.merchant, func.count().label("n"))
        .where(unknown_pred)
        .group_by(Transaction.merchant)
    ).subquery()

    q = (
        select(
            q_unknown.c.merchant,
            q_unknown.c.n.label("unknown_n"),
            q_known.c.category,
            q_known.c.n.label("hist_n"),
        )
        .join(q_known, q_known.c.merchant == q_unknown.c.merchant)
        .order_by(q_unknown.c.merchant, q_known.c.n.desc())
    )

    rows = db.execute(q).all()
    out: list[Suggestion] = []
    seen = set()
    for merchant, u_n, cat, hist_n in rows:
        if merchant in seen:
            continue
        seen.add(merchant)
        if u_n < body.min_support:
            continue
        share = min(1.0, hist_n / max(u_n, 1))
        if share < body.min_share:
            continue
        ex_q = (
            select(Transaction.id)
            .where(unknown_pred, Transaction.merchant == merchant)
            .limit(1)
        )
        ex_id = db.execute(ex_q).scalar()
        out.append(
            Suggestion(
                merchant=merchant,
                suggest_category=cat,
                confidence=round(share, 2),
                support=int(u_n),
                example_txn_id=ex_id,
                month=month,
            )
        )
        if len(out) >= body.limit:
            break

    # Optional UX nicety: if a specific month was provided but produced no
    # suggestions, include a meta reason and log a concise info line for ops.
    if body.month and not out:
        logger.info("suggestions.empty_window", extra={"month": month})
        return SuggestionsResponse(items=[], meta={"reason": "no_data_for_month"})

    return SuggestionsResponse(items=out)

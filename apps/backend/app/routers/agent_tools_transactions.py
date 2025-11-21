from typing import List, Optional, Literal, Dict, Any, Annotated, Tuple
from datetime import date, timedelta
import re
import calendar
from fastapi import APIRouter, Depends, HTTPException
from app.utils.csrf import csrf_protect
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, desc, asc
from sqlalchemy.orm import Session

from app.db import get_db
from app.transactions import Transaction
from app.deps.auth_guard import get_current_user_id

router = APIRouter(
    prefix="/agent/tools/transactions", tags=["agent-tools:transactions"]
)


# ---------- Time Window Parser ----------
MONTH_NAMES = {name.lower(): i for i, name in enumerate(calendar.month_name) if name}
MONTH_ABBRS = {abbr.lower(): i for i, abbr in enumerate(calendar.month_abbr) if abbr}
MONTH_LOOKUP = {**MONTH_NAMES, **MONTH_ABBRS}


def parse_time_window_from_query(
    q: str, today: Optional[date] = None
) -> Tuple[date, date]:
    """
    Best-effort parser for queries like:
      - 'transactions > $50 last 90 days'
      - 'Starbucks this month'
      - 'Delta in Aug 2025'
      - 'rent in September 2024'
    Returns (start_date, end_date) inclusive.
    """
    if today is None:
        today = date.today()

    q_lower = q.lower()

    # --- last N days ---
    m = re.search(r"last\s+(\d+)\s+day", q_lower)
    if m:
        days = int(m.group(1))
        start = today - timedelta(days=days)
        return start, today

    # --- last month ---
    if "last month" in q_lower:
        year = today.year
        month = today.month - 1
        if month == 0:
            month = 12
            year -= 1
        start = date(year, month, 1)
        # end = last day of that month
        if month == 12:
            next_year, next_month = year + 1, 1
        else:
            next_year, next_month = year, month + 1
        end = date(next_year, next_month, 1) - timedelta(days=1)
        return start, end

    # --- this month ---
    if "this month" in q_lower:
        start = date(today.year, today.month, 1)
        return start, today

    # --- explicit "in Aug 2025" / "August 2025" ---
    m = re.search(
        r"\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|"
        r"september|sep|october|oct|november|nov|december|dec)\s+(\d{4})\b",
        q_lower,
    )
    if m:
        month_token = m.group(1)
        year = int(m.group(2))
        month = MONTH_LOOKUP[month_token]
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(year, month + 1, 1) - timedelta(days=1)
        # If month is in the future, just clamp to month end; no need to special-case
        return start, end

    # --- fallback: last 90 days ---
    default_start = today - timedelta(days=90)
    return default_start, today


# ---------- Pydantic I/O ----------
class TxnDTO(BaseModel):
    id: int
    date: str
    month: str
    merchant: str
    description: str
    amount: float
    category: Optional[str] = None

    @classmethod
    def from_row(cls, t: Transaction) -> "TxnDTO":
        return cls(
            id=t.id,
            date=t.date.isoformat() if hasattr(t.date, "isoformat") else str(t.date),
            month=t.month,
            merchant=t.merchant or "",
            description=t.description or "",
            amount=float(t.amount),
            category=t.category,
        )


OrderField = Literal["date", "amount", "merchant", "id"]
OrderDir = Literal["asc", "desc"]


class SearchQuery(BaseModel):
    month: Optional[str] = Field(None, description="YYYY-MM; filters by t.month")
    merchant_contains: Optional[str] = None
    description_contains: Optional[str] = None
    category_in: Optional[List[str]] = Field(
        None, description="Match any of these categories"
    )
    unlabeled_only: bool = Field(
        False, description='Treat None/""/"Unknown" as unlabeled when true'
    )
    # Use numeric fields with constraints via Field to satisfy type checkers
    min_amount: Optional[float] = Field(
        None, description="Minimum amount (<=0 for outflows, >=0 for inflows)"
    )
    max_amount: Optional[float] = Field(
        None, description="Maximum amount (<=0 for outflows, >=0 for inflows)"
    )
    order_by: OrderField = "date"
    order_dir: OrderDir = "desc"
    offset: int = Field(0, ge=0)
    limit: int = Field(50, ge=1, le=200)


class SearchResponse(BaseModel):
    total: int
    items: List[TxnDTO]


class CategorizeBody(BaseModel):
    txn_ids: Annotated[List[int], Field(min_length=1)]
    category: str = Field(..., min_length=1)


class GetByIdsBody(BaseModel):
    txn_ids: Annotated[List[int], Field(min_length=1)]


class GetByIdsResponse(BaseModel):
    items: List[TxnDTO]


class SearchTransactionsRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Natural language search query")


class SearchTransactionsResultItem(BaseModel):
    id: int
    booked_at: str
    merchant_canonical: str
    amount: float
    category_slug: Optional[str] = None


class SearchTransactionsResult(BaseModel):
    reply: str
    query: str
    total_count: int
    total_amount: float
    items: List[SearchTransactionsResultItem]


# ---------- Helpers ----------
def _unlabeled_condition():
    # None / empty / literal "Unknown" (case-insensitive)
    return or_(
        Transaction.category.is_(None),
        func.trim(Transaction.category) == "",
        func.lower(Transaction.category) == "unknown",
    )


def _apply_order(query, field: OrderField, direction: OrderDir):
    col = {
        "date": Transaction.date,
        "amount": Transaction.amount,
        "merchant": Transaction.merchant,
        "id": Transaction.id,
    }[field]
    return query.order_by(asc(col) if direction == "asc" else desc(col))


# ---------- Endpoints ----------
@router.post("/search", response_model=SearchResponse)
def search_transactions(
    user_id: int = Depends(get_current_user_id),
    body: SearchQuery = ...,
    db: Session = Depends(get_db),
) -> SearchResponse:
    q = db.query(Transaction).filter(Transaction.user_id == user_id)

    if body.month:
        q = q.filter(Transaction.month == body.month)

    if body.merchant_contains:
        like = f"%{body.merchant_contains}%"
        q = q.filter(Transaction.merchant.ilike(like))

    if body.description_contains:
        like = f"%{body.description_contains}%"
        q = q.filter(Transaction.description.ilike(like))

    if body.category_in:
        # special-case unlabeled sentinel
        if any(c.lower() == "unlabeled" for c in body.category_in):
            q = q.filter(_unlabeled_condition())
            others = [c for c in body.category_in if c.lower() != "unlabeled"]
            if others:
                q = q.filter(
                    or_(Transaction.category.in_(others), _unlabeled_condition())
                )
        else:
            q = q.filter(Transaction.category.in_(body.category_in))

    if body.unlabeled_only:
        q = q.filter(_unlabeled_condition())

    if body.min_amount is not None:
        q = q.filter(Transaction.amount >= body.min_amount)
    if body.max_amount is not None:
        q = q.filter(Transaction.amount <= body.max_amount)

    total = q.count()
    q = _apply_order(q, body.order_by, body.order_dir)
    rows = q.offset(body.offset).limit(body.limit).all()

    return SearchResponse(total=total, items=[TxnDTO.from_row(t) for t in rows])


@router.post(
    "/categorize", response_model=Dict[str, Any], dependencies=[Depends(csrf_protect)]
)
def categorize_transactions(
    user_id: int = Depends(get_current_user_id),
    body: CategorizeBody = ...,
    db: Session = Depends(get_db),
):
    updated = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.id.in_(body.txn_ids))
        .update({Transaction.category: body.category}, synchronize_session=False)
    )
    db.commit()
    return {"updated": int(updated), "category": body.category, "txn_ids": body.txn_ids}


@router.post("/search_nl", response_model=SearchTransactionsResult)
def search_transactions_nl(
    user_id: int = Depends(get_current_user_id),
    payload: SearchTransactionsRequest = ...,
    db: Session = Depends(get_db),
) -> SearchTransactionsResult:
    """
    Natural language search for transactions with time window, amount, and merchant parsing.
    """
    q = payload.query.strip()
    if not q:
        raise HTTPException(400, "query is required")

    today = date.today()
    start_date, end_date = parse_time_window_from_query(q, today=today)

    # --- amount threshold ---
    amount_min = None
    amount_max = None

    # > $50 / over 50
    m = re.search(r"(?:>|over|above)\s*\$?([\d.]+)", q, flags=re.IGNORECASE)
    if m:
        amount_min = float(m.group(1))

    # < $20 / under 20
    m = re.search(r"(?:<|under|below)\s*\$?([\d.]+)", q, flags=re.IGNORECASE)
    if m:
        amount_max = float(m.group(1))

    # Build query
    query_obj = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.date >= start_date,
        Transaction.date <= end_date,
    )

    # charges are stored negative in LedgerMind
    if amount_min is not None:
        query_obj = query_obj.filter(Transaction.amount <= -amount_min)
    if amount_max is not None:
        query_obj = query_obj.filter(Transaction.amount >= -amount_max)

    # --- merchant tokens ---
    tokens = re.findall(r"[A-Za-z]+", q)
    stopwords = {
        "last",
        "this",
        "month",
        "months",
        "day",
        "days",
        "transactions",
        "transaction",
        "over",
        "above",
        "under",
        "below",
        "greater",
        "than",
        "in",
        "for",
        "the",
        "and",
        "or",
        "a",
        "an",
    }
    merchant_tokens = [t for t in tokens if t.lower() not in stopwords]

    if merchant_tokens:
        # Use merchant (raw) field with ilike pattern
        pattern = "%" + "%".join(merchant_tokens) + "%"
        query_obj = query_obj.filter(Transaction.merchant.ilike(pattern))

    # Order by date desc, limit to 50
    query_obj = query_obj.order_by(desc(Transaction.date)).limit(50)
    rows = query_obj.all()

    total_count = len(rows)
    total_amount = sum(abs(float(t.amount)) for t in rows)

    items = [
        SearchTransactionsResultItem(
            id=t.id,
            booked_at=(
                t.date.isoformat() if hasattr(t.date, "isoformat") else str(t.date)
            ),
            merchant_canonical=t.merchant or "Unknown",
            amount=float(t.amount),
            category_slug=t.category,
        )
        for t in rows
    ]

    # Build reply
    if total_count == 0:
        reply = f"No transactions found matching '{q}'."
    elif total_count == 1:
        reply = f"Found 1 transaction matching '{q}' (${total_amount:.2f})."
    else:
        reply = f"Found {total_count} transactions matching '{q}' (${total_amount:.2f} total)."

    return SearchTransactionsResult(
        reply=reply,
        query=q,
        total_count=total_count,
        total_amount=total_amount,
        items=items,
    )


@router.post("/get_by_ids", response_model=GetByIdsResponse)
def get_by_ids(
    user_id: int = Depends(get_current_user_id),
    body: GetByIdsBody = ...,
    db: Session = Depends(get_db),
) -> GetByIdsResponse:
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.id.in_(body.txn_ids))
        .all()
    )
    if not rows:
        # Keep it 200 for agent friendliness, but signal empty
        return GetByIdsResponse(items=[])
    return GetByIdsResponse(items=[TxnDTO.from_row(t) for t in rows])

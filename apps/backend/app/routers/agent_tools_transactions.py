from typing import List, Optional, Literal, Dict, Any, Annotated
from fastapi import APIRouter, Depends
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

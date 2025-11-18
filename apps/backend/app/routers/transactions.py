from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional  # noqa: F401 (kept for potential future query params)
from enum import Enum

from app.db import get_db
from app.transactions import Transaction
from app.deps.auth_guard import get_current_user_id

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionStatusFilter(str, Enum):
    """Filter for transaction status (pending vs posted)."""

    all = "all"
    posted = "posted"
    pending = "pending"


@router.get("", response_model=list)
def list_transactions(
    user_id: int = Depends(get_current_user_id),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status: TransactionStatusFilter = Query(TransactionStatusFilter.all),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction).filter(
        Transaction.user_id == user_id
    )  # ✅ Scope by user

    # Apply status filter
    if status == TransactionStatusFilter.posted:
        query = query.filter(Transaction.pending.is_(False))
    elif status == TransactionStatusFilter.pending:
        query = query.filter(Transaction.pending.is_(True))
    # if status == all → no extra filter

    rows = (
        query.order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "date": r.date.isoformat() if r.date else None,
            "merchant": r.merchant,
            "description": r.description,
            "amount": r.amount,
            "category": r.category,
            "account": r.account,
            "month": r.month,
            "pending": r.pending,
        }
        for r in rows
    ]


@router.get("/{txn_id}", response_model=dict)
def get_transaction(
    txn_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    r = (
        db.query(Transaction)
        .filter(
            Transaction.id == txn_id,
            Transaction.user_id == user_id,  # ✅ Verify ownership
        )
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="transaction not found")
    return {
        "id": r.id,
        "date": r.date.isoformat() if r.date else None,
        "merchant": r.merchant,
        "description": r.description,
        "amount": r.amount,
        "category": r.category,
        "account": r.account,
        "month": r.month,
        "pending": r.pending,
    }

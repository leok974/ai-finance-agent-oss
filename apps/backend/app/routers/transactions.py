from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional  # noqa: F401 (kept for potential future query params)

from app.db import get_db
from app.transactions import Transaction
from app.deps.auth_guard import get_current_user_id

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list)
def list_transactions(
    user_id: int = Depends(get_current_user_id),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)  # ✅ Scope by user
        .order_by(Transaction.date.desc(), Transaction.id.desc())
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
    }

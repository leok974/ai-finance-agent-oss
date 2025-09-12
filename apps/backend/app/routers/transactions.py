from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List

from app.db import get_db
from app.transactions import Transaction

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list)
def list_transactions(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Transaction)
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
def get_transaction(txn_id: int, db: Session = Depends(get_db)):
    r = db.query(Transaction).filter(Transaction.id == txn_id).first()
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

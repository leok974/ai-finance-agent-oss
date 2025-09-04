from fastapi import APIRouter, Query, Depends
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.db import get_db
from app.orm_models import Transaction

router = APIRouter()


@router.get("")
def insights(month: str | None = Query(None), db: Session = Depends(get_db)):
    # Total net amount (income positive, spend negative)
    total = (
        db.execute(select(func.sum(Transaction.amount)).where(
            Transaction.month == month if month else True
        ))
        .scalar() or 0.0
    )

    # Top merchants by absolute net amount
    q_merch = select(
        Transaction.merchant,
        func.sum(Transaction.amount).label("sum"),
    )
    if month:
        q_merch = q_merch.where(Transaction.month == month)
    q_merch = (
        q_merch.group_by(Transaction.merchant)
        .order_by(func.abs(func.sum(Transaction.amount)).desc())
        .limit(5)
    )
    rows = db.execute(q_merch).all()

    return {
        "month": month,
        "total": float(total),
        "top_merchants": [
            {"merchant": m or "(unknown)", "sum": float(s or 0)} for (m, s) in rows
        ],
    }

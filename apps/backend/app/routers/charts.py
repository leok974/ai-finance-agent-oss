from fastapi import APIRouter, Query, Depends
from collections import defaultdict
from sqlalchemy import select, func, case
from sqlalchemy.orm import Session
from app.db import get_db
from app.orm_models import Transaction

router = APIRouter()


def _latest_month_db(db: Session) -> str | None:
    return db.execute(select(func.max(Transaction.month))).scalar()


@router.get("/month_summary")
def month_summary(month: str = Query(None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    """Get spending summary for a month (DB-backed)."""
    if not month:
        month = _latest_month_db(db)
        if not month:
            return {"month": None, "total_spend": 0, "total_income": 0, "net": 0, "categories": []}

    totals = db.execute(
        select(
            func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)).label("income"),
            func.sum(case((Transaction.amount < 0, func.abs(Transaction.amount)), else_=0)).label("spend"),
        ).where(Transaction.month == month)
    ).one()
    total_income = float(totals.income or 0)
    total_spend = float(totals.spend or 0)

    cat_rows = db.execute(
        select(
            func.coalesce(Transaction.category, "Unknown").label("cat"),
            func.sum(func.abs(Transaction.amount)).label("amt"),
        )
        .where(Transaction.month == month, Transaction.amount < 0)
        .group_by("cat")
        .order_by(func.sum(func.abs(Transaction.amount)).desc())
    ).all()
    category_data = [{"name": c, "amount": round(float(a or 0), 2)} for (c, a) in cat_rows]

    return {
        "month": month,
        "total_spend": round(total_spend, 2),
        "total_income": round(total_income, 2),
        "net": round(total_income - total_spend, 2),
        "categories": category_data,
    }


@router.get("/month_merchants")
def month_merchants(month: str = Query(None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    """Get top merchants for a month (DB-backed)."""
    if not month:
        month = _latest_month_db(db)
        if not month:
            return {"month": None, "merchants": []}

    rows = db.execute(
        select(
            func.coalesce(Transaction.merchant, "Unknown").label("merchant"),
            func.sum(func.abs(Transaction.amount)).label("amt"),
        )
        .where(Transaction.month == month, Transaction.amount < 0)
        .group_by("merchant")
        .order_by(func.sum(func.abs(Transaction.amount)).desc())
        .limit(10)
    ).all()
    merchant_data = [{"merchant": m, "amount": round(float(a or 0), 2)} for (m, a) in rows]
    return {"month": month, "merchants": merchant_data}


@router.get("/month_flows")
def month_flows(month: str = Query(None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    """Get daily cash flows for a month (DB-backed)."""
    if not month:
        month = _latest_month_db(db)
        if not month:
            return {"month": None, "series": []}

    rows = db.execute(
        select(
            Transaction.date,
            func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0)).label("inc"),
            func.sum(case((Transaction.amount < 0, func.abs(Transaction.amount)), else_=0)).label("out"),
        )
        .where(Transaction.month == month)
        .group_by(Transaction.date)
        .order_by(Transaction.date)
    ).all()
    series = [
        {
            "date": d.isoformat(),
            "in": round(float(inc or 0), 2),
            "out": round(float(out or 0), 2),
            "net": round(float((inc or 0) - (out or 0)), 2),
        }
        for (d, inc, out) in rows
    ]
    return {"month": month, "series": series}
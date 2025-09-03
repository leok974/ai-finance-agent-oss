from fastapi import APIRouter, Query, Depends
from collections import defaultdict
from sqlalchemy import select, func, case, or_
from sqlalchemy.orm import Session
from app.db import get_db
from app.orm_models import Transaction

router = APIRouter()


def _latest_month_db(db: Session) -> str | None:
    return db.execute(select(func.max(Transaction.month))).scalar()


# Heuristic: classify income vs spend for positive-amount CSVs
def _income_condition():
    cat_lower = func.lower(func.coalesce(Transaction.category, ""))
    merch_lower = func.lower(func.coalesce(Transaction.merchant, ""))
    return or_(
        cat_lower.in_(["income", "transfer in"]),
        merch_lower.like("%employer%"),
        merch_lower.like("%payroll%"),
        merch_lower.like("%salary%"),
        merch_lower.like("%paycheck%"),
        merch_lower.like("%payout%"),
        merch_lower.like("%reimbursement%"),
        merch_lower.like("%refund%"),
    )


def _income_case():
    return case((_income_condition(), Transaction.amount), else_=0.0)


def _spend_case():
    # everything not flagged as income is treated as spend
    return case((~_income_condition(), Transaction.amount), else_=0.0)


@router.get("/month_summary")
def month_summary(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    """Return a summary for the requested month, or latest if omitted (heuristic income/spend)."""
    if not month:
        month = _latest_month_db(db)
    if not month:
        return {"month": None, "total_spend": 0.0, "total_income": 0.0, "net": 0.0, "categories": []}

    total_income = (
        db.execute(select(func.sum(_income_case())).where(Transaction.month == month)).scalar() or 0.0
    )
    total_spend = (
        db.execute(select(func.sum(_spend_case())).where(Transaction.month == month)).scalar() or 0.0
    )

    # Category breakdown using spend heuristic
    cat_expr = func.coalesce(Transaction.category, "Unknown")
    cat_rows = db.execute(
        select(cat_expr.label("cat"), func.sum(_spend_case()).label("amt"))
        .where(Transaction.month == month)
        .group_by(cat_expr)
        .order_by(func.sum(_spend_case()).desc())
    ).all()
    category_data = [{"name": c, "amount": round(float(a or 0), 2)} for (c, a) in cat_rows]

    return {
        "month": month,
        "total_spend": float(total_spend),
        "total_income": float(total_income),
        "net": float(total_income - total_spend),
        "categories": category_data,
    }


@router.get("/month_merchants")
def month_merchants(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    """Top merchants for a month (expenses only), ordered by spend desc."""
    if not month:
        month = _latest_month_db(db)
        if not month:
            return {"month": None, "merchants": []}
    rows = db.execute(
        select(
            func.coalesce(Transaction.merchant, "Unknown").label("merchant"),
            func.sum(func.abs(Transaction.amount)).label("amount"),
            func.count().label("n"),
        )
        .where(Transaction.month == month, Transaction.amount < 0)
        .group_by("merchant")
        .order_by(func.sum(func.abs(Transaction.amount)).desc())
        .limit(10)
    ).all()
    return {
        "month": month,
        "merchants": [
            {"merchant": m, "amount": round(float(a or 0), 2), "n": int(n)} for (m, a, n) in rows
        ],
    }


@router.get("/month_flows")
def month_flows(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    """Get flows for a month as per-transaction in/out/net rows (UI-friendly)."""
    if not month:
        month = _latest_month_db(db)
        if not month:
            return {"month": None, "series": []}

    rows = db.execute(
        select(Transaction.date, Transaction.amount, Transaction.merchant)
        .where(Transaction.month == month)
        .order_by(Transaction.date)
    ).all()

    series = []
    for (d, a, m) in rows:
        amt = float(a or 0.0)
        series.append(
            {
                "date": d.isoformat(),
                "in": round(amt if amt > 0 else 0.0, 2),
                "out": round(abs(amt) if amt < 0 else 0.0, 2),
                "net": round(amt, 2),
                "merchant": m,
            }
        )

    return {"month": month, "series": series}


@router.get("/spending_trends")
def spending_trends(months: int = Query(6, ge=1, le=24), db: Session = Depends(get_db)):
    """Return last N months of spend/income/net using heuristics, wrapped for UI."""
    rows = db.execute(
        select(
            Transaction.month.label("month"),
            func.sum(_spend_case()).label("spend"),
            func.sum(_income_case()).label("income"),
        )
        .group_by(Transaction.month)
        .order_by(Transaction.month.desc())
        .limit(months)
    ).all()
    trends = []
    for m, spend, income in rows:
        s = float(spend or 0.0)
        i = float(income or 0.0)
        trends.append({"month": m, "spending": s, "income": i, "net": round(i - s, 2)})
    trends = list(reversed(trends))
    return {"months": months, "trends": trends}
from fastapi import APIRouter, Query, Depends
from datetime import date as _date
from sqlalchemy import select, func, case, or_, and_
from sqlalchemy.orm import Session
from app.db import get_db
from app.transactions import Transaction

router = APIRouter()

def _latest_month_str(db: Session) -> str | None:
    """Return YYYY-MM for the latest transaction date, or None."""
    max_d = db.execute(select(func.max(Transaction.date))).scalar()
    return max_d.strftime("%Y-%m") if max_d else None


def _month_bounds(yyyymm: str) -> tuple[_date, _date]:
    """Return [first_day, first_day_next_month) bounds."""
    y, m = map(int, yyyymm.split("-", 1))
    first = _date(y, m, 1)
    nm_y, nm_m = (y + 1, 1) if m == 12 else (y, m + 1)
    first_next = _date(nm_y, nm_m, 1)
    return first, first_next


# Heuristic: classify income vs spend for positive-amount CSVs
def _is_transfer(lower_cat, lower_merc):
    # Treat anything with "transfer" in category or merchant as a transfer (neutral)
    lower_rawcat = func.lower(func.coalesce(Transaction.raw_category, ""))
    lower_desc = func.lower(func.coalesce(Transaction.description, ""))
    return or_(
        lower_cat.like("%transfer%"),
        lower_rawcat.like("%transfer%"),
        lower_merc.like("%transfer%"),
        lower_desc.like("%transfer%"),
    )


def _income_case():
    lower_cat = func.lower(func.coalesce(Transaction.category, ""))
    lower_merc = func.lower(func.coalesce(Transaction.merchant, ""))
    lower_desc = func.lower(func.coalesce(Transaction.description, ""))
    income_keywords = or_(
        lower_merc.like("%employer%"),
        lower_merc.like("%payroll%"),
        lower_merc.like("%salary%"),
        lower_merc.like("%paycheck%"),
        lower_merc.like("%payout%"),
        lower_merc.like("%reimbursement%"),
        lower_merc.like("%refund%"),
        # Also support description-based hints to match existing behavior/tests
        lower_desc.like("%reimbursement%"),
        lower_desc.like("%refund%"),
    )
    # Exclude transfers from income; allow explicit Income category or keyword matches
    return case(
        (and_(~_is_transfer(lower_cat, lower_merc), lower_cat.in_(["income"])), Transaction.amount),
        (and_(~_is_transfer(lower_cat, lower_merc), income_keywords), Transaction.amount),
        else_=0.0,
    )


def _spend_case():
    lower_cat = func.lower(func.coalesce(Transaction.category, ""))
    lower_merc = func.lower(func.coalesce(Transaction.merchant, ""))
    lower_desc = func.lower(func.coalesce(Transaction.description, ""))
    income_keywords = or_(
        lower_merc.like("%employer%"),
        lower_merc.like("%payroll%"),
        lower_merc.like("%salary%"),
        lower_merc.like("%paycheck%"),
        lower_merc.like("%payout%"),
        lower_merc.like("%reimbursement%"),
        lower_merc.like("%refund%"),
        lower_desc.like("%reimbursement%"),
        lower_desc.like("%refund%"),
    )
    # Exclude transfers from spend; exclude clear income signals
    return case(
        (and_(~_is_transfer(lower_cat, lower_merc), ~income_keywords, ~lower_cat.in_(["income"])), Transaction.amount),
        else_=0.0,
    )


@router.get("/month_summary")
def month_summary(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    """Return a summary for the requested month, or latest if omitted (heuristic income/spend).
    Preference order for resolving month when not provided:
    1) If in-memory txns exist, use their latest month (onboarding/dev flows)
    2) Else fall back to DB latest month
    If both are empty, return a null-month payload for onboarding.
    """
    mem_items = None
    try:
        from ..main import app
        mem_items = [t for t in getattr(app.state, "txns", []) if isinstance(t, dict)]
    except Exception:
        mem_items = None

    if not month:
        if mem_items is not None:
            # In-memory explicitly set; if empty, treat as no transactions loaded
            if len(mem_items) == 0:
                return {"month": None, "total_spend": 0.0, "total_income": 0.0, "net": 0.0, "categories": []}
            # Derive latest from in-memory and compute totals directly from in-memory
            import datetime as dt
            months = []
            for t in mem_items:
                ds = str(t.get("date", ""))
                if not ds:
                    continue
                try:
                    d = dt.date.fromisoformat(ds[:10])
                    months.append(d.strftime("%Y-%m"))
                except Exception:
                    if len(ds) >= 7:
                        months.append(ds[:7])
            month = max(months) if months else None
            if month:
                # Filter items for that month
                month_items = []
                for t in mem_items:
                    ds = str(t.get("date", ""))
                    if not ds:
                        continue
                    try:
                        d = dt.date.fromisoformat(ds[:10])
                        if d.strftime("%Y-%m") == month:
                            month_items.append(t)
                    except Exception:
                        if ds[:7] == month:
                            month_items.append(t)
                # Compute totals using sign and absolute magnitudes
                pos = [abs(float(t.get("amount", 0.0))) for t in month_items if float(t.get("amount", 0.0)) > 0]
                neg = [abs(float(t.get("amount", 0.0))) for t in month_items if float(t.get("amount", 0.0)) < 0]
                total_income = float(sum(pos))
                total_spend = float(sum(neg))
                # categories from negative (spend) amounts
                agg = {}
                for t in month_items:
                    amt = float(t.get("amount", 0.0))
                    if amt < 0:
                        cat = t.get("category") or "Unknown"
                        agg[cat] = agg.get(cat, 0.0) + abs(amt)
                category_data = [
                    {"name": c, "amount": round(float(a), 2)} for c, a in sorted(agg.items(), key=lambda x: -x[1])
                ]
                return {
                    "month": month,
                    "total_spend": total_spend,
                    "total_income": total_income,
                    "net": total_income - total_spend,
                    "categories": category_data,
                }
        if not month:
            month = _latest_month_str(db)
    if not month:
        return {"month": None, "total_spend": 0.0, "total_income": 0.0, "net": 0.0, "categories": []}

    start, end = _month_bounds(month)

    # Build inline expressions using absolute magnitudes while preserving heuristics
    lower_cat = func.lower(func.coalesce(Transaction.category, ""))
    lower_merc = func.lower(func.coalesce(Transaction.merchant, ""))
    lower_desc = func.lower(func.coalesce(Transaction.description, ""))
    income_keywords = or_(
        lower_merc.like("%employer%"),
        lower_merc.like("%payroll%"),
        lower_merc.like("%salary%"),
        lower_merc.like("%paycheck%"),
        lower_merc.like("%payout%"),
        lower_merc.like("%reimbursement%"),
        lower_merc.like("%refund%"),
        # allow description hints as well
        lower_desc.like("%reimbursement%"),
        lower_desc.like("%refund%"),
    )
    is_transfer = _is_transfer(lower_cat, lower_merc)
    amt_abs = func.abs(Transaction.amount)

    income_expr = case(
        (and_(~is_transfer, lower_cat.in_(["income"])), amt_abs),
        (and_(~is_transfer, income_keywords), amt_abs),
        else_=0.0,
    )
    spend_expr = case(
        (and_(~is_transfer, ~income_keywords, ~lower_cat.in_(["income"])), amt_abs),
        else_=0.0,
    )

    totals = db.execute(
        select(
            func.sum(spend_expr),
            func.sum(income_expr),
        ).where(Transaction.date >= start, Transaction.date < end)
    ).one()
    total_spend = float(totals[0] or 0.0)
    total_income = float(totals[1] or 0.0)

    # If heuristics produced zeros but we have data, fall back to sign-only totals
    txn_count = db.execute(
        select(func.count()).where(Transaction.date >= start, Transaction.date < end)
    ).scalar() or 0

    if txn_count > 0 and total_spend == 0.0 and total_income == 0.0:
        s_spend, s_income = db.execute(
            select(
                func.sum(case((Transaction.amount < 0, amt_abs), else_=0.0)),
                func.sum(case((Transaction.amount > 0, amt_abs), else_=0.0)),
            ).where(Transaction.date >= start, Transaction.date < end)
        ).one()
        total_spend = float(s_spend or 0.0)
        total_income = float(s_income or 0.0)

    # Category breakdown using spend heuristic (already absolute via spend_expr)
    cat_expr = func.coalesce(Transaction.category, "Unknown")
    cat_rows = db.execute(
        select(cat_expr.label("cat"), func.sum(spend_expr).label("amt"))
        .where(Transaction.date >= start, Transaction.date < end)
        .group_by(cat_expr)
        .order_by(func.sum(spend_expr).desc())
    ).all()
    category_data = [{"name": c, "amount": round(float(a or 0), 2)} for (c, a) in cat_rows]

    # If DB has no rows for this month, compute from in-memory state for tests/dev
    if txn_count == 0:
        try:
            from ..main import app
            import datetime as dt
            items = [t for t in getattr(app.state, "txns", []) if isinstance(t, dict)]
            # If no DB data and no explicit month, choose latest from in-memory
            if not month:
                # find latest month via dates
                months = []
                for t in items:
                    date_str = str(t.get("date", ""))
                    if not date_str:
                        continue
                    try:
                        date_obj = dt.date.fromisoformat(date_str[:10])
                        months.append(date_obj.strftime("%Y-%m"))
                    except Exception:
                        continue
                if months:
                    month = sorted(months)[-1]
            # Filter using proper date parsing instead of string slicing
            month_items = []
            for t in items:
                date_str = str(t.get("date", ""))
                if date_str:
                    try:
                        date_obj = dt.date.fromisoformat(date_str[:10])
                        if date_obj.strftime("%Y-%m") == month:
                            month_items.append(t)
                    except (ValueError, TypeError):
                        # Fallback to string slicing for malformed dates
                        if date_str[:7] == month:
                            month_items.append(t)
            if month_items:
                pos = [abs(float(t.get("amount", 0.0))) for t in month_items if float(t.get("amount", 0.0)) > 0]
                neg = [abs(float(t.get("amount", 0.0))) for t in month_items if float(t.get("amount", 0.0)) < 0]
                total_income = float(sum(pos))
                total_spend = float(sum(neg))
                # keep logic quiet in production/tests
                # categories from negative (spend) amounts
                agg = {}
                for t in month_items:
                    amt = float(t.get("amount", 0.0))
                    if amt < 0:
                        cat = t.get("category") or "Unknown"
                        agg[cat] = agg.get(cat, 0.0) + abs(amt)
                category_data = [
                    {"name": c, "amount": round(float(a), 2)} for c, a in sorted(agg.items(), key=lambda x: -x[1])
                ]
        except Exception:
            pass

    return {
        "month": month,
        "total_spend": total_spend,
        "total_income": total_income,
        "net": total_income - total_spend,
        "categories": category_data,
    }


@router.get("/month_merchants")
def month_merchants(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    """Top merchants for a month (expenses only), ordered by spend desc."""
    if not month:
        month = _latest_month_str(db)
        if not month:
            return {"month": None, "merchants": []}
    start, end = _month_bounds(month)
    # Apply the same spend heuristic as month_summary and normalize to positive magnitudes
    lower_cat = func.lower(func.coalesce(Transaction.category, ""))
    lower_merc = func.lower(func.coalesce(Transaction.merchant, ""))
    lower_desc = func.lower(func.coalesce(Transaction.description, ""))
    income_keywords = or_(
        lower_merc.like("%employer%"),
        lower_merc.like("%payroll%"),
        lower_merc.like("%salary%"),
        lower_merc.like("%paycheck%"),
        lower_merc.like("%payout%"),
        lower_merc.like("%reimbursement%"),
        lower_merc.like("%refund%"),
        lower_desc.like("%reimbursement%"),
        lower_desc.like("%refund%"),
    )
    is_transfer = _is_transfer(lower_cat, lower_merc)
    spend_expr = case(
        (and_(~is_transfer, ~income_keywords, ~lower_cat.in_(["income"])), func.abs(Transaction.amount)),
        else_=0.0,
    )

    rows = db.execute(
        select(
            Transaction.merchant.label("merchant"),
            func.sum(spend_expr).label("amount"),
            func.count().label("n"),
        )
        .where(Transaction.date >= start, Transaction.date < end)
        .group_by(Transaction.merchant)
        .order_by(func.sum(spend_expr).desc())
        .limit(10)
    ).all()
    return {
        "month": month,
        "merchants": [
            {"merchant": (m or "(unknown)"), "amount": float(a or 0.0), "n": int(n)} for (m, a, n) in rows
        ],
    }


@router.get("/month_flows")
def month_flows(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    """Return per-transaction flows with in/out/net using date bounds (no aggregation)."""
    if not month:
        month = _latest_month_str(db)
        if not month:
            return {"month": None, "series": []}
    start, end = _month_bounds(month)

    rows = db.execute(
        select(Transaction.date, Transaction.amount, Transaction.merchant)
        .where(Transaction.date >= start, Transaction.date < end)
        .order_by(Transaction.date)
    ).all()

    series = []
    for (d, a, m) in rows:
        amt = float(a or 0.0)
        series.append({
            "date": d.isoformat(),
            "in": amt if amt > 0 else 0.0,
            "out": abs(amt) if amt < 0 else 0.0,
            "net": amt,
            "merchant": m,
        })
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
        s = abs(float(spend or 0.0))
        i = float(income or 0.0)
        trends.append({"month": m, "spending": s, "income": i, "net": round(i - s, 2)})
    trends = list(reversed(trends))
    return {"months": months, "trends": trends}
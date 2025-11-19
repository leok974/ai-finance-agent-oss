from __future__ import annotations

from datetime import date as _date, timedelta
from typing import Any, Dict, Optional

from sqlalchemy import select, func, case, or_, and_
from sqlalchemy.orm import Session

from app.transactions import Transaction

# --- Month helpers ------------------------------------------------------------


def latest_month_str(db: Session, user_id: int) -> str | None:
    """Return YYYY-MM for the latest transaction date, or None."""
    max_d = db.execute(
        select(func.max(Transaction.date)).where(Transaction.user_id == user_id)
    ).scalar()
    return max_d.strftime("%Y-%m") if max_d else None


def month_bounds(yyyymm: str) -> tuple[_date, _date]:
    """Return [first_day, first_day_next_month) bounds for a given YYYY-MM."""
    y, m = map(int, yyyymm.split("-", 1))
    first = _date(y, m, 1)
    nm_y, nm_m = (y + 1, 1) if m == 12 else (y, m + 1)
    first_next = _date(nm_y, nm_m, 1)
    return first, first_next


def resolve_window(
    db: Session,
    user_id: int,
    month: Optional[str],
    start: Optional[str],
    end: Optional[str],
) -> tuple[_date, _date]:
    """
    Priority:
      1) If start & end given -> parse as YYYY-MM-DD (inclusive)
      2) Else use month (YYYY-MM)
      3) Else latest DB month
    Returns a (start_date, end_date) inclusive tuple.
    """
    if start and end:
        y1, m1, d1 = map(int, start.split("-"))
        y2, m2, d2 = map(int, end.split("-"))
        return _date(y1, m1, d1), _date(y2, m2, d2)

    mm = month or latest_month_str(db, user_id)
    if not mm:
        # No data to infer a window from
        raise ValueError("No month/window available")
    first, first_next = month_bounds(mm)
    end_inclusive = first_next - timedelta(days=1)
    return first, end_inclusive


# --- Heuristics reused from charts router ------------------------------------


def _is_transfer(lower_cat, lower_merc):
    lower_rawcat = func.lower(func.coalesce(Transaction.raw_category, ""))
    lower_desc = func.lower(func.coalesce(Transaction.description, ""))
    return or_(
        lower_cat.like("%transfer%"),
        lower_rawcat.like("%transfer%"),
        lower_merc.like("%transfer%"),
        lower_desc.like("%transfer%"),
    )


def _income_keywords(lower_merc, lower_desc):
    return or_(
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


def income_case():
    lower_cat = func.lower(func.coalesce(Transaction.category, ""))
    lower_merc = func.lower(func.coalesce(Transaction.merchant, ""))
    lower_desc = func.lower(func.coalesce(Transaction.description, ""))
    income_keywords = _income_keywords(lower_merc, lower_desc)
    return case(
        (
            and_(~_is_transfer(lower_cat, lower_merc), lower_cat.in_(["income"])),
            Transaction.amount,
        ),
        (
            and_(~_is_transfer(lower_cat, lower_merc), income_keywords),
            Transaction.amount,
        ),
        else_=0.0,
    )


def spend_case():
    lower_cat = func.lower(func.coalesce(Transaction.category, ""))
    lower_merc = func.lower(func.coalesce(Transaction.merchant, ""))
    lower_desc = func.lower(func.coalesce(Transaction.description, ""))
    income_keywords = _income_keywords(lower_merc, lower_desc)
    return case(
        (
            and_(
                ~_is_transfer(lower_cat, lower_merc),
                ~income_keywords,
                ~lower_cat.in_(["income"]),
            ),
            Transaction.amount,
        ),
        else_=0.0,
    )


# --- Data aggregations used by both charts and exports ------------------------


def get_month_summary(db: Session, user_id: int, month: str) -> Dict[str, Any]:
    start, end = month_bounds(month)

    lower_cat = func.lower(func.coalesce(Transaction.category, ""))
    lower_merc = func.lower(func.coalesce(Transaction.merchant, ""))
    lower_desc = func.lower(func.coalesce(Transaction.description, ""))
    income_keywords = _income_keywords(lower_merc, lower_desc)
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
        ).where(
            Transaction.user_id == user_id,  # ✅ Scope by user
            Transaction.date >= start,
            Transaction.date < end,
            ~Transaction.pending,  # Exclude pending transactions
        )
    ).one()
    total_spend = float(totals[0] or 0.0)
    total_income = float(totals[1] or 0.0)

    cat_expr = func.coalesce(Transaction.category, "Unknown")
    cat_rows = db.execute(
        select(cat_expr.label("cat"), func.sum(spend_expr).label("amt"))
        .where(
            Transaction.user_id == user_id,  # ✅ Scope by user
            Transaction.date >= start,
            Transaction.date < end,
            ~Transaction.pending,  # Exclude pending transactions
        )
        .group_by(cat_expr)
        .order_by(func.sum(spend_expr).desc())
    ).all()
    categories = [{"name": c, "amount": round(float(a or 0), 2)} for (c, a) in cat_rows]

    return {
        "month": month,
        "total_spend": total_spend,
        "total_income": total_income,
        "net": total_income - total_spend,
        "categories": categories,
    }


def canonicalize_merchant(raw: str) -> str:
    """
    Generic merchant normalization without brand-specific rules.
    Removes digits, extra punctuation, and normalizes spacing.
    """
    if not raw:
        return "unknown"

    import re

    s = raw.lower()

    # Remove obvious noise: digits, extra punctuation
    s = re.sub(r"\d+", " ", s)
    s = re.sub(r"[^a-z& ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()

    # If we stripped everything somehow, fall back to raw lower
    return s or raw.lower()


def display_name_for(canonical: str) -> str:
    """
    Convert canonical merchant key to user-facing display name.
    Generic approach with safety truncation for long labels.
    """
    if not canonical or canonical == "unknown":
        return "(unknown)"

    name = canonical.title()
    # Safety truncation so labels/tooltips don't explode
    return name if len(name) <= 32 else name[:29] + "..."


def get_month_merchants(
    db: Session, user_id: int, month: str, limit: int = 8
) -> Dict[str, Any]:
    """
    Fast SQL GROUP BY over canonical merchant; expenses only as positive magnitudes.
    Returns enhanced data with friendly display names and statement examples.

    Default limit reduced to 8 for better chart readability.
    """
    start, end = month_bounds(month)
    spend_abs = func.sum(func.abs(Transaction.amount)).label("amount")
    cnt = func.count().label("n")

    # First, get aggregated totals grouped by canonical merchant
    rows = db.execute(
        select(
            Transaction.merchant_canonical.label("canonical"),
            func.min(Transaction.merchant).label("merchant"),  # Keep one example
            spend_abs,
            cnt,
        )
        .where(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.amount < 0,
            ~Transaction.pending,
        )
        .group_by(Transaction.merchant_canonical)
        .order_by(spend_abs.desc())
        .limit(limit)
    ).all()

    # For each canonical merchant, collect statement examples
    merchants_data = []
    for canonical, first_merchant, amount, count in rows:
        # Get up to 3 unique statement descriptors for this canonical merchant
        examples = (
            db.execute(
                select(func.distinct(Transaction.merchant))
                .where(
                    Transaction.user_id == user_id,
                    Transaction.date >= start,
                    Transaction.date < end,
                    Transaction.merchant_canonical == canonical,
                    Transaction.merchant.is_not(None),
                )
                .limit(3)
            )
            .scalars()
            .all()
        )

        merchants_data.append(
            {
                "merchant_key": canonical or "(unknown)",
                "label": display_name_for(canonical),
                "total": float(amount or 0.0),
                "count": int(count or 0),
                "statement_examples": [ex for ex in examples if ex],
            }
        )

    return {
        "month": month,
        "merchants": merchants_data,
    }


def get_month_categories(
    db: Session, user_id: int, month: str, limit: int = 50
) -> list[dict[str, Any]]:
    """Category spend aggregation (expenses only), descending by total spend."""
    start, end = month_bounds(month)
    spend_abs = func.sum(func.abs(Transaction.amount)).label("spend")
    rows = db.execute(
        select(
            Transaction.category.label("category"),
            spend_abs,
        )
        .where(
            Transaction.user_id == user_id,  # ✅ Scope by user
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.amount < 0,
            Transaction.category.is_not(None),
            Transaction.category != "",
            ~Transaction.pending,  # Exclude pending transactions
        )
        .group_by(Transaction.category)
        .order_by(spend_abs.desc())
        .limit(limit)
    ).all()
    return [{"category": c, "spend": float(s or 0.0)} for (c, s) in rows]


def get_month_flows(db: Session, user_id: int, month: str) -> Dict[str, Any]:
    start, end = month_bounds(month)
    rows = db.execute(
        select(Transaction.date, Transaction.amount, Transaction.merchant)
        .where(
            Transaction.user_id == user_id,  # ✅ Scope by user
            Transaction.date >= start,
            Transaction.date < end,
            ~Transaction.pending,  # Exclude pending transactions
        )
        .order_by(Transaction.date)
    ).all()
    series = []
    for d, a, m in rows:
        amt = float(a or 0.0)
        series.append(
            {
                "date": d.isoformat(),
                "in": amt if amt > 0 else 0.0,
                "out": abs(amt) if amt < 0 else 0.0,
                "net": amt,
                "merchant": m,
            }
        )
    return {"month": month, "series": series}


def get_spending_trends(db: Session, user_id: int, months: int = 6) -> Dict[str, Any]:
    rows = db.execute(
        select(
            Transaction.month.label("month"),
            func.sum(spend_case()).label("spend"),
            func.sum(income_case()).label("income"),
        )
        .where(Transaction.user_id == user_id)  # ✅ Scope by user
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


# --- Category timeseries (single category) -----------------------------------
def get_category_timeseries(db: Session, user_id: int, category: str, months: int = 6):
    """
    Build a per-month time series for a single category over the last N months.

    Semantics:
    - Sums expense magnitudes only (amount < 0 → abs(amount)).
    - Income and transfers are excluded.
    - Returns a list of { month: 'YYYY-MM', amount: number } sorted ascending by month.
    """
    # find max date
    max_dt = db.execute(
        select(func.max(Transaction.date)).where(
            Transaction.user_id == user_id
        )  # ✅ Scope by user
    ).scalar()
    if not max_dt:
        return None
    # compute earliest month start
    y, m = max_dt.year, max_dt.month
    ey, em = y, m
    for _ in range(months - 1):
        em -= 1
        if em <= 0:
            em += 12
            ey -= 1
    earliest = _date(ey, em, 1)
    # window end is first day of next month
    nm_y, nm_m = (y + 1, 1) if m == 12 else (y, m + 1)
    end = _date(nm_y, nm_m, 1)

    # Dialect-specific month key
    if db.bind and getattr(db.bind.dialect, "name", "") == "sqlite":
        ym = func.strftime("%Y-%m", Transaction.date)
    else:
        # Prefer ANSI via to_char on Postgres
        ym = func.to_char(Transaction.date, "YYYY-MM")

    rows = db.execute(
        select(ym.label("ym"), func.sum(func.abs(Transaction.amount)).label("amt"))
        .where(
            Transaction.user_id == user_id,  # ✅ Scope by user
            Transaction.date >= earliest,
            Transaction.date < end,
            Transaction.category == category,
            Transaction.amount < 0,
        )
        .group_by(ym)
        .order_by(ym.asc())
    ).all()
    series = [{"month": k, "amount": float(v or 0.0)} for k, v in rows]
    return series

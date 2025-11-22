from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date as _date, timedelta
from typing import Any, Dict, List, Optional

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


# --- Merchant normalization with brand rules ----------------------------------


@dataclass(frozen=True)
class MerchantBrandRule:
    """Brand recognition rule for merchant normalization."""

    key: str  # internal canonical key
    label: str  # user-facing label
    patterns: List[str]  # substrings to match in normalized string


# Brand rules config - centralized brand knowledge
# Add new rules here as you discover noisy merchant patterns
MERCHANT_BRAND_RULES: List[MerchantBrandRule] = [
    MerchantBrandRule(
        key="playstation",
        label="PlayStation",
        patterns=["playstatio", "playstation"],
    ),
    MerchantBrandRule(
        key="harris_teeter",
        label="Harris Teeter",
        patterns=["harris teeter"],
    ),
    MerchantBrandRule(
        key="now_withdrawal",
        label="NOW Withdrawal",
        patterns=["now withdrawal"],
    ),
    MerchantBrandRule(
        key="amazon",
        label="Amazon",
        patterns=["amazon"],
    ),
    MerchantBrandRule(
        key="starbucks",
        label="Starbucks",
        patterns=["starbucks"],
    ),
    MerchantBrandRule(
        key="target",
        label="Target",
        patterns=["target"],
    ),
    MerchantBrandRule(
        key="walmart",
        label="Walmart",
        patterns=["walmart"],
    ),
]


def normalize_merchant_base(raw: str) -> str:
    """
    Base merchant normalization - brand-agnostic.
    Strips digits, punctuation, and normalizes spacing.
    """
    if not raw:
        return "unknown"

    s = raw.lower()

    # Strip digits / punctuation / duplicate spaces
    s = re.sub(r"\d+", " ", s)
    s = re.sub(r"[^a-z& ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()

    return s or raw.lower()


def canonical_and_label(raw: str) -> tuple[str, str]:
    """
    Combined function: base normalize → then apply brand rules.
    Returns (canonical_key, display_label) tuple.
    """
    base = normalize_merchant_base(raw)

    # 1) Try brand rules first
    for rule in MERCHANT_BRAND_RULES:
        if any(pat in base for pat in rule.patterns):
            return rule.key, rule.label

    # 2) Generic fallback for unknown merchants
    key = base or "unknown"
    label = key.title()
    if len(label) > 32:
        label = label[:29] + "..."
    return key, label


def get_month_merchants(
    db: Session, user_id: int, month: str, limit: int = 8
) -> Dict[str, Any]:
    """
    Aggregate top merchants using brand-aware normalization with Redis cache.
    Groups transactions by normalized merchant key and returns friendly labels.

    Uses merchant memory cache to learn and remember merchants over time.
    Default limit reduced to 8 for better chart readability.

    Returns merchant data with explicit fields:
    - merchant_canonical: str - canonical key used for grouping (lowercase, normalized)
    - merchant_display: str - user-facing display name (title case)
    - sample_description: str - example raw transaction description
    - category: str | None - learned category from merchant cache
    """
    from app.redis_client import redis
    from app.services.merchant_cache import learn_merchant

    start, end = month_bounds(month)
    redis_client = redis()

    # Fetch all expense transactions for the month
    txns = db.execute(
        select(Transaction.merchant, Transaction.amount, Transaction.description).where(
            Transaction.user_id == user_id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.amount < 0,
            ~Transaction.pending,
        )
    ).all()

    # Aggregate using brand-aware normalization with cache
    buckets: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {
            "display": "",
            "total": 0.0,
            "count": 0,
            "statement_examples": set(),
            "category": None,
        }
    )

    for raw_merchant, amount, description in txns:
        raw = raw_merchant or "unknown"

        # Try to learn/lookup merchant from cache
        if redis_client:
            hint = learn_merchant(
                redis_client, db, raw, description=description, amount=amount
            )
            key = hint.normalized_name
            display = hint.display_name
            category = hint.category
        else:
            # Fallback to direct normalization if Redis unavailable
            key, display = canonical_and_label(raw)
            category = None

        b = buckets[key]
        b["display"] = display
        b["category"] = category
        b["total"] = float(b["total"]) + abs(float(amount or 0.0))
        b["count"] = int(b["count"]) + 1
        b["statement_examples"].add(raw)  # type: ignore

    # Convert to list and sort by total spend
    items = []
    for key, b in buckets.items():
        # Pick first statement example as sample
        examples = sorted(b["statement_examples"])
        sample_desc = examples[0] if examples else key

        items.append(
            {
                "merchant_canonical": key,
                "merchant_display": b["display"],
                "sample_description": sample_desc,
                "total": b["total"],
                "count": b["count"],
                "statement_examples": examples[:3],
                "category": b["category"],
                # Legacy fields for backward compatibility
                "merchant_key": key,
                "label": b["display"],
            }
        )

    items.sort(key=lambda r: r["total"], reverse=True)
    top_merchants = items[:limit]

    return {
        "month": month,
        "merchants": top_merchants,
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

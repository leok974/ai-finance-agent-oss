# apps/backend/app/services/budget_recommend.py
from __future__ import annotations
from collections import defaultdict
from datetime import date
from typing import Dict, List, Tuple, Any, Optional

from sqlalchemy.orm import Session
from sqlalchemy import func, and_

# Reuse your existing ORM model import path
from app.orm_models import Transaction  # adjust import if your project differs


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _quantile(sorted_vals: List[float], q: float) -> float:
    """
    Simple inclusive quantile (p50/p75) without numpy to avoid extra deps.
    q is 0..1. For small N, we pick linear interpolation between neighbors.
    """
    n = len(sorted_vals)
    if n == 0:
        return 0.0
    if n == 1:
        return float(sorted_vals[0])
    # Using method ~ Type 7 (Excel/Pandas default)
    idx = (n - 1) * q
    lo = int(idx)
    hi = min(lo + 1, n - 1)
    frac = idx - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def _abs_spend(amount: float) -> float:
    """
    Ensure spend is positive magnitude. By convention in this project,
    expenses are often negative; budgets should be positive caps.
    """
    return float(abs(amount))


def _is_expense_row(amount: Optional[float], category: Optional[str]) -> bool:
    if amount is None:
        return False
    # Treat strictly negative amounts as expenses; ignore income/transfers.
    if amount < 0:
        return True
    # If you want to also include edge cases (e.g., mis-signed rows),
    # add a fallback: categories known to be expenses could pass here.
    return False


def _window_from_max(max_dt: date, months: int) -> Tuple[date, date, List[str]]:
    """Build [start_date, end_date) and ordered YYYY-MM keys from a max date."""
    if not max_dt:
        today = date.today()
        return today, today, []
    y, m = max_dt.year, max_dt.month
    keys: List[str] = []
    for i in range(months):
        yy = y
        mm = m - i
        while mm <= 0:
            mm += 12
            yy -= 1
        keys.append(f"{yy:04d}-{mm:02d}")
    keys = list(reversed(keys))
    start_y, start_m = map(int, keys[0].split("-"))
    end_y, end_m = map(int, keys[-1].split("-"))
    start_date = date(start_y, start_m, 1)
    end_date = date(end_y + (1 if end_m == 12 else 0), (1 if end_m == 12 else end_m + 1), 1)
    return start_date, end_date, keys

def _current_month_bounds(db: Session) -> tuple[date, date] | None:
    max_dt = db.query(func.max(Transaction.date)).scalar()
    if not max_dt:
        return None
    start = date(max_dt.year, max_dt.month, 1)
    end = date(max_dt.year + (1 if max_dt.month == 12 else 0), (1 if max_dt.month == 12 else max_dt.month + 1), 1)
    return (start, end)


def _category_current_spend(db: Session) -> dict[str, float]:
    bounds = _current_month_bounds(db)
    if not bounds:
        return {}
    start, end = bounds
    rows = (
        db.query(Transaction.category, func.sum(func.abs(Transaction.amount)))
        .filter(
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.category.isnot(None),
            Transaction.category != "",
            Transaction.category != "Unknown",
            Transaction.amount < 0,
        )
        .group_by(Transaction.category)
        .all()
    )
    return {cat: float(total or 0.0) for cat, total in rows}


def compute_recommendations(db: Session, months: int = 6, min_samples: int = 2, include_current: bool = True) -> List[Dict[str, Any]]:
    """
    Look at the last N full months; compute per-category monthly spend totals
    and derive median (p50), p75, and average (mean) as recommended caps.
    - Only expense rows (negative amounts) are included.
    - Transfers are implicitly excluded if they are non-negative or recoded;
      if you explicitly mark transfers, filter them here as needed.
    Returns: [{category, median, p75, avg, sample_size}]
    """
    months = max(3, min(24, int(months)))
    # Determine window based on latest EXPENSE row (negative amount, non-Unknown)
    max_dt = (
        db.query(func.max(Transaction.date))
        .filter(
            Transaction.amount < 0,
            Transaction.category.isnot(None),
            Transaction.category != "",
            Transaction.category != "Unknown",
        )
        .scalar()
    )
    if not max_dt:
        return []
    start_date, end_date, _keys = _window_from_max(max_dt, months)

    # Pull candidate expense rows in window
    rows = (
        db.query(Transaction.category, Transaction.date, Transaction.amount)
        .filter(
            and_(
                Transaction.date >= start_date,
                Transaction.date < end_date,
                Transaction.amount < 0,
                Transaction.category.isnot(None),
                Transaction.category != "",
                Transaction.category != "Unknown",
            )
        )
        .all()
    )

    # Accumulate per-month spend by category (only expenses)
    # category_month_totals[category][YYYY-MM] = total_spend_positive
    category_month_totals: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for category, dt, amt in rows:
        if not _is_expense_row(amt, category):
            continue
        key = _month_key(dt)
        category_month_totals[category][key] += _abs_spend(amt)

    # Convert each category's month totals → list for stats
    current = _category_current_spend(db) if include_current else {}
    recommendations: List[Dict[str, Any]] = []
    for category, month_map in category_month_totals.items():
        samples = sorted(month_map.values())
        # Exclude categories with too few months to form a meaningful cap
        if not samples or len(samples) < max(1, int(min_samples)):
            continue
        median = _quantile(samples, 0.5)
        p75 = _quantile(samples, 0.75)
        avg = sum(samples) / len(samples)
        cur = current.get(category, 0.0)
        over = cur > p75 if include_current else None
        recommendations.append({
            "category": category,
            "median": round(median, 2),
            "p75": round(p75, 2),
            "avg": round(avg, 2),
            "sample_size": len(samples),
            "current_month": round(cur, 2) if include_current else None,
            "over_p75": bool(over) if include_current else None,
        })

    # Stable sort: highest median first, then p75 desc, then alpha
    recommendations.sort(key=lambda r: (-r["median"], -r["p75"], r["category"].lower()))
    return recommendations

# apps/backend/app/services/insights_anomalies.py
from __future__ import annotations
from dataclasses import dataclass, asdict
from datetime import date
from typing import Dict, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.orm_models import Transaction

@dataclass
class Anomaly:
    category: str
    current: float
    median: float
    pct_from_median: float  # e.g., +0.42 = +42%, -0.20 = -20%
    sample_size: int        # months used for median
    direction: str          # "high" | "low"

def _parse_month(ym: str) -> Tuple[int, int]:
    """Parse YYYY-MM into (year, month). Raises ValueError on invalid input."""
    parts = ym.split("-")
    if len(parts) != 2:
        raise ValueError("month must be YYYY-MM")
    y, m = int(parts[0]), int(parts[1])
    if not (1 <= m <= 12):
        raise ValueError("month must be between 01 and 12")
    return y, m

def _next_month_start(y: int, m: int) -> date:
    return date(y + (1 if m == 12 else 0), (1 if m == 12 else m + 1), 1)

def _month_bounds(db: Session, target_month: str | None = None) -> Tuple[date, date] | None:
    """Return (start_of_month, start_of_next_month) for target_month or latest month if None."""
    if target_month:
        try:
            y, m = _parse_month(target_month)
        except Exception:
            # Invalid month format -> treat as no data
            return None
        start = date(y, m, 1)
        end = _next_month_start(y, m)
        return (start, end)
    max_dt = db.query(func.max(Transaction.date)).scalar()
    if not max_dt:
        return None
    start = date(max_dt.year, max_dt.month, 1)
    end   = _next_month_start(max_dt.year, max_dt.month)
    return (start, end)

def _abs_spend(amount: float) -> float:
    return float(abs(amount or 0.0))

def compute_category_monthly_totals(db: Session, months: int, window_end: date) -> Dict[str, Dict[str, float]]:
    """
    Returns category -> { "YYYY-MM" -> total_spend_positive } for last N full months (including current month-to-date).
    Expenses only (amount < 0). Unknown/empty categories skipped.
    """
    # Earliest date to include, relative to provided window_end (start of next month)
    # Include from first day (N-1) months ago up to window_end.
    y, m = (window_end.year, window_end.month - 1) if window_end.month > 1 else (window_end.year - 1, 12)
    earliest_y, earliest_m = y, m
    for _ in range(months - 1):
        earliest_m -= 1
        if earliest_m <= 0:
            earliest_m += 12
            earliest_y -= 1
    earliest = date(earliest_y, earliest_m, 1)
    # window_end is provided by caller (start of next month for the anchor month)

    # Month key expression varies by dialect; reuse in group_by as well
    is_sqlite = (db.bind and getattr(db.bind.dialect, "name", "") == "sqlite")
    month_expr = (func.strftime("%Y-%m", Transaction.date) if is_sqlite else func.to_char(Transaction.date, "YYYY-MM")).label("ym")

    rows = (
        db.query(
            Transaction.category,
            month_expr,
            func.sum(func.abs(Transaction.amount)).label("total")
        )
        .filter(
            and_(
                Transaction.date >= earliest,
                Transaction.date < window_end,
                Transaction.category.isnot(None),
                Transaction.category != "",
                Transaction.category != "Unknown",
                Transaction.amount < 0,  # expenses only
            )
        )
        .group_by(Transaction.category, month_expr)
        .all()
    )

    data: Dict[str, Dict[str, float]] = {}
    for cat, ym, total in rows:
        data.setdefault(cat, {})[ym] = float(total or 0.0)
    return data

def _median(xs: List[float]) -> float:
    n = len(xs)
    if n == 0:
        return 0.0
    xs = sorted(xs)
    mid = n // 2
    if n % 2 == 1:
        return float(xs[mid])
    return float((xs[mid - 1] + xs[mid]) / 2.0)

def compute_anomalies(
    db: Session,
    months: int = 6,
    min_spend_current: float = 50.0,
    threshold_pct: float = 0.4,
    max_results: int = 8,
    target_month: str | None = None,
    ignore_categories: list[str] | None = None,
) -> Dict:
    """
    Flags categories whose current month spend deviates from the median of the prior months by more than `threshold_pct`.
    - Uses last `months` (incl. current) of data.
    - Only categories with current >= min_spend_current are considered (avoid noise).
    """
    bounds = _month_bounds(db, target_month=target_month)
    if not bounds:
        return {"month": None, "anomalies": []}
    cur_start, cur_end = bounds
    y_m = f"{cur_start.year:04d}-{cur_start.month:02d}"

    # Build monthly totals
    cat_month = compute_category_monthly_totals(db, months, cur_end)
    anomalies: List[Anomaly] = []
    ignores = set(ignore_categories or [])

    for cat, series in cat_month.items():
        if cat in ignores:
            continue
        current = float(series.get(y_m, 0.0))
        if current < min_spend_current:
            continue
        # historical months (exclude current)
        hist = [v for k, v in series.items() if k != y_m]
        if len(hist) < 2:
            continue
        med = _median(hist)
        if med <= 0:
            continue
        pct = (current - med) / med
        if abs(pct) >= threshold_pct:
            anomalies.append(
                Anomaly(
                    category=cat,
                    current=round(current, 2),
                    median=round(med, 2),
                    pct_from_median=round(pct, 4),
                    sample_size=len(hist),
                    direction="high" if pct > 0 else "low",
                )
            )

    # Sort high deviations first
    anomalies.sort(key=lambda a: abs(a.pct_from_median), reverse=True)
    top = [asdict(a) for a in anomalies[:max_results]]
    return {"month": y_m, "anomalies": top}

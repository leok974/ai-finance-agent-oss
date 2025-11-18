# app/services/insights_expanded.py
from __future__ import annotations
from typing import Dict, Any, List, Optional, Tuple, Literal
from collections import defaultdict
from dataclasses import dataclass
import datetime as dt

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.transactions import Transaction

UNLABELED = {"", "Unknown", None}

# Status filter type for pending transactions
TransactionStatus = Literal["all", "posted", "pending"]


def latest_month_from_data(db: Session) -> Optional[str]:
    row = db.query(Transaction).order_by(Transaction.date.desc()).first()
    return row.date.strftime("%Y-%m") if row and row.date else None


def prev_month(month: str) -> str:
    y, m = map(int, month.split("-"))
    d = dt.date(y, m, 1)
    prev = (d.replace(day=1) - dt.timedelta(days=1)).replace(day=1)
    return prev.strftime("%Y-%m")


@dataclass
class MonthAgg:
    month: str
    income: float
    spend: float
    net: float
    by_category: Dict[str, float]
    by_merchant: Dict[str, float]
    unknown_spend_amount: float
    unknown_spend_count: int
    large_transactions: List[Dict[str, Any]]


def _safe_pct(curr: float, prev: float) -> Optional[float]:
    # JSON-safe percentage; None when prev == 0 to avoid inf
    if prev == 0:
        return None
    return (curr - prev) / abs(prev)


def _abs_amount(x: Any) -> float:
    try:
        return abs(float(x or 0.0))
    except Exception:
        return 0.0


def _sum_dict(items: List[Tuple[str, float]]) -> Dict[str, float]:
    out: Dict[str, float] = defaultdict(float)
    for k, v in items:
        out[k] += float(v or 0.0)
    return dict(out)


def load_month(
    db: Session,
    month: str,
    status: TransactionStatus = "posted",
    large_limit: int = 10,
) -> MonthAgg:
    # Pull all txns for month (filtering by pending status)
    query = db.query(Transaction).filter(Transaction.month == month)

    # Filter by pending status
    if status == "posted":
        query = query.filter(Transaction.pending.is_(False))
    elif status == "pending":
        query = query.filter(Transaction.pending.is_(True))
    # status == "all" → no filter

    txns: List[Transaction] = query.all()

    income = 0.0
    spend = 0.0
    by_cat_items: List[Tuple[str, float]] = []
    by_merch_items: List[Tuple[str, float]] = []
    unknown_amount = 0.0
    unknown_count = 0

    # Aggregate
    for t in txns:
        amt = float(t.amount or 0.0)
        if amt >= 0:
            income += amt
        else:
            spend += -amt  # spend as positive number
        cat_key = t.category or "Unknown"
        by_cat_items.append((cat_key, _abs_amount(amt) if amt < 0 else 0.0))
        merch_key = t.merchant or "Unknown"
        by_merch_items.append((merch_key, _abs_amount(amt) if amt < 0 else 0.0))
        if (t.category in UNLABELED) and amt < 0:
            unknown_amount += -amt
            unknown_count += 1

    by_category = _sum_dict(by_cat_items)
    by_merchant = _sum_dict(by_merch_items)

    # Large transactions (top N by absolute spend)
    spenders = [t for t in txns if (t.amount or 0) < 0]
    spenders.sort(key=lambda x: _abs_amount(x.amount), reverse=True)
    large = []
    for t in spenders[:large_limit]:
        large.append(
            {
                "id": t.id,
                "date": t.date.isoformat() if t.date else None,
                "merchant": t.merchant,
                "description": t.description,
                "amount": float(t.amount or 0.0),
                "category": t.category,
            }
        )

    return MonthAgg(
        month=month,
        income=income,
        spend=spend,
        net=income - spend,
        by_category=by_category,
        by_merchant=by_merchant,
        unknown_spend_amount=unknown_amount,
        unknown_spend_count=unknown_count,
        large_transactions=large,
    )


def _delta_map(curr: Dict[str, float], prev: Dict[str, float]) -> List[Dict[str, Any]]:
    # Produce a sorted list of deltas by key (desc by abs delta)
    keys = set(curr) | set(prev)
    rows: List[Dict[str, Any]] = []
    for k in keys:
        c = float(curr.get(k, 0.0))
        p = float(prev.get(k, 0.0))
        rows.append(
            {
                "key": k,
                "curr": c,
                "prev": p,
                "delta": c - p,
                "pct": _safe_pct(c, p),
            }
        )
    rows.sort(key=lambda r: abs(r["delta"]), reverse=True)
    return rows


def detect_anomalies(
    cat_deltas: List[Dict[str, Any]],
    merch_deltas: List[Dict[str, Any]],
    min_amount: float = 50.0,
    min_pct: float = 0.5,
    limit: int = 5,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Very simple anomalies: big increases vs prior month.
    min_pct = 0.5 -> +50% or more (when prev>0). If prev==0, require curr>=min_amount.
    """

    def _flagged(rows: List[Dict[str, Any]]):
        flagged: List[Dict[str, Any]] = []
        for r in rows:
            c, p = r["curr"], r["prev"]
            if p == 0:
                if c >= min_amount:
                    flagged.append(r)
            else:
                pct = _safe_pct(c, p)
                if pct is not None and pct >= min_pct and (c - p) >= min_amount:
                    flagged.append(r)
        return flagged[:limit]

    return {
        "categories": _flagged(cat_deltas),
        "merchants": _flagged(merch_deltas),
    }


def build_expanded_insights(
    db: Session,
    month: Optional[str],
    status: TransactionStatus = "posted",
    large_limit: int = 10,
) -> Dict[str, Any]:
    # Resolve month
    resolved = month or latest_month_from_data(db)
    if not resolved:
        return {
            "month": None,
            "prev_month": None,
            "summary": None,
            "mom": None,
            "unknown_spend": None,
            "top_categories": [],
            "top_merchants": [],
            "large_transactions": [],
            "anomalies": {"categories": [], "merchants": []},
        }

    curr = load_month(db, resolved, status=status, large_limit=large_limit)
    prev = None
    try:
        pm = prev_month(resolved)
        # Only load if previous month actually exists (has rows)
        prev_has = (
            db.query(func.count(Transaction.id))
            .filter(Transaction.month == pm)
            .scalar()
            or 0
        )
        prev = (
            load_month(db, pm, status=status, large_limit=large_limit)
            if prev_has
            else None
        )
    except Exception:
        prev = None

    # Top categories/merchants (spend)
    top_cats = sorted(
        [{"category": k, "amount": v} for k, v in curr.by_category.items()],
        key=lambda x: x["amount"],
        reverse=True,
    )[:5]
    top_merch = sorted(
        [{"merchant": k, "amount": v} for k, v in curr.by_merchant.items()],
        key=lambda x: x["amount"],
        reverse=True,
    )[:5]

    # MoM summary deltas
    mom = None
    if prev:
        mom = {
            "income": {
                "curr": curr.income,
                "prev": prev.income,
                "delta": curr.income - prev.income,
                "pct": _safe_pct(curr.income, prev.income),
            },
            "spend": {
                "curr": curr.spend,
                "prev": prev.spend,
                "delta": curr.spend - prev.spend,
                "pct": _safe_pct(curr.spend, prev.spend),
            },
            "net": {
                "curr": curr.net,
                "prev": prev.net,
                "delta": curr.net - prev.net,
                "pct": _safe_pct(curr.net, prev.net),
            },
        }

    # Deltas by category/merchant for anomaly detection
    cat_deltas = _delta_map(curr.by_category, prev.by_category if prev else {})
    merch_deltas = _delta_map(curr.by_merchant, prev.by_merchant if prev else {})
    anomalies = detect_anomalies(cat_deltas, merch_deltas)

    return {
        "month": curr.month,
        "prev_month": prev.month if prev else None,
        "summary": {"income": curr.income, "spend": curr.spend, "net": curr.net},
        "mom": mom,  # may be None if no previous month
        "unknown_spend": {
            "count": curr.unknown_spend_count,
            "amount": curr.unknown_spend_amount,
        },
        "top_categories": top_cats,
        "top_merchants": top_merch,
        "large_transactions": curr.large_transactions,
        "anomalies": anomalies,
    }

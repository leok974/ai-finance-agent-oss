from __future__ import annotations
from typing import Any, Dict, List, Optional, cast
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from app.utils.state import latest_month as _latest_month
from app.models import Transaction, Rule  # use SQLAlchemy models


def ctx_latest_month(db: Session) -> Optional[str]:
    """Return the latest month string (YYYY-MM) if discoverable.

    Wrapped with a cast because the underlying helper is loosely typed (returns Any).
    Once `app.utils.state.latest_month` is annotated, this cast can be removed.
    """
    return cast(Optional[str], _latest_month(db))


def ctx_month_summary(db: Session, month: str) -> Dict[str, Any]:
    # Minimal summary; adapt to your heuristics if needed
    total_out = (
        db.query(func.sum(func.abs(Transaction.amount)))
        .filter(Transaction.month == month, Transaction.amount < 0)
        .scalar()
        or 0.0
    )
    total_in = (
        db.query(func.sum(Transaction.amount))
        .filter(Transaction.month == month, Transaction.amount > 0)
        .scalar()
        or 0.0
    )
    return {
        "month": month,
        "total_outflows": float(total_out),
        "total_inflows": float(total_in),
    }


def ctx_top_merchants(db: Session, month: str) -> List[Dict[str, Any]]:
    rows = (
        db.query(
            Transaction.merchant,
            func.sum(func.abs(Transaction.amount)).label("total"),
            func.count().label("count"),
        )
        .filter(Transaction.month == month)
        .group_by(Transaction.merchant)
        .order_by(desc("total"))
        .limit(50)
        .all()
    )
    return [
        {"merchant": r[0], "total": float(r[1]), "count": int(r[2])}
        for r in rows
        if r[0]
    ]


def ctx_alerts(db: Session, month: str) -> List[Dict[str, Any]]:
    return []  # plug into your existing alerts table if you have one


def ctx_insights(db: Session, month: str) -> List[Dict[str, Any]]:
    return []  # plug into your insights source


def ctx_rules(db: Session) -> List[Dict[str, Any]]:
    # If you have a Rule model; otherwise return []
    try:
        rules = db.query(Rule).limit(200).all()
        return [
            {"id": r.id, "pattern": r.pattern, "category": r.category} for r in rules
        ]
    except Exception:
        return []


def ctx_suggestions(db: Session, month: str) -> List[Dict[str, Any]]:
    # If you have persistent suggestions, fetch them; otherwise return []
    return []


def ctx_txn_by_id(db: Session, txn_id: str) -> Optional[Dict[str, Any]]:
    t = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not t:
        return None
    return {
        "id": t.id,
        "date": str(t.date),
        "merchant": t.merchant,
        "description": getattr(t, "description", None),
        "amount": float(t.amount),
        "category": t.category,
        "month": t.month,
    }

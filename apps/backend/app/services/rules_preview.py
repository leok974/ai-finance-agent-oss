from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from app.models import Transaction


def _cutoff(window_days: Optional[int]) -> Optional[datetime]:
    if window_days is None:
        return None
    try:
        if int(window_days) <= 0:
            return None
    except Exception:
        return None
    # Use naive UTC date for comparison against Transaction.date (a Date)
    return datetime.utcnow() - timedelta(days=int(window_days))


def _q_base(db: Session, only_uncategorized: bool):
    q = db.query(Transaction)
    if only_uncategorized:
        q = q.filter(
            or_(
                Transaction.category.is_(None),
                func.trim(Transaction.category) == "",
                Transaction.category == "Unknown",
            )
        )
    return q


def _q_window(q, cutoff: Optional[datetime]):
    return q if cutoff is None else q.filter(Transaction.date >= cutoff.date())


def _q_when(q, when: Dict[str, Any]):
    target = (when.get("target") or "description").lower()
    pattern = (when.get("pattern") or "").strip()
    if not pattern:
        return q
    like_expr = f"%{pattern}%"
    # Prefer column.ilike for case-insensitive match across backends
    if target == "merchant" and hasattr(Transaction, "merchant"):
        return q.filter(Transaction.merchant.ilike(like_expr))
    return q.filter(Transaction.description.ilike(like_expr))


def normalize_rule_input(payload: Dict[str, Any]) -> Dict[str, Any]:
    if "when" in payload and "then" in payload:
        return payload
    return {
        "when": {"target": payload.get("target", "description"), "pattern": payload.get("pattern", "")},
        "then": {"category": payload.get("category")},
    }


def preview_rule_matches(
    db: Session,
    rule_input: Dict[str, Any],
    window_days: Optional[int],
    only_uncategorized: bool,
    sample_limit: int = 10,
) -> Tuple[int, List[Dict[str, Any]]]:
    ri = normalize_rule_input(rule_input)
    q = _q_base(db, only_uncategorized)
    q = _q_window(q, _cutoff(window_days))
    q = _q_when(q, ri["when"])
    total = q.count()
    sample = q.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(sample_limit).all()
    rows = [
        {
            "id": t.id,
            "date": t.date.isoformat() if getattr(t, "date", None) else None,
            "amount": float(getattr(t, "amount", 0.0) or 0.0),
            "description": getattr(t, "description", None),
            "merchant": getattr(t, "merchant", None),
            "existing_category": getattr(t, "category", None),
        }
        for t in sample
    ]
    return total, rows


def backfill_rule_apply(
    db: Session,
    rule_input: Dict[str, Any],
    window_days: Optional[int],
    only_uncategorized: bool,
    dry_run: bool,
    limit: Optional[int] = None,
) -> Dict[str, Any]:
    ri = normalize_rule_input(rule_input)
    new_cat = ri.get("then", {}).get("category")
    assert new_cat, "then.category required"
    q = _q_base(db, only_uncategorized)
    q = _q_window(q, _cutoff(window_days))
    q = _q_when(q, ri["when"])
    if limit:
        q = q.limit(int(limit))
    rows = q.all()
    ids: List[int] = []
    for t in rows:
        ids.append(t.id)
        if not dry_run:
            t.category = new_cat
    if not dry_run and ids:
        db.commit()
    return {"matched": len(ids), "changed_ids": ids[:50]}

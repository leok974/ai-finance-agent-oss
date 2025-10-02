# app/services/rules_apply.py
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Iterable, Optional, Tuple, Dict, Any, List
from app.transactions import Transaction
from app.models import Rule

UNLABELED_VALUES = ("", "Unknown")

def is_unlabeled_expr():
    # SQLAlchemy filter expression for unlabeled semantics
    return or_(
        Transaction.category.is_(None),
        Transaction.category.in_(UNLABELED_VALUES),
    )

def latest_month_from_data(db: Session) -> Optional[str]:
    """Resolve latest month from transactions, preferring explicit month column if present.
    Falls back to deriving from date.
    """
    # First, try to find the latest month that still has unlabeled transactions
    from sqlalchemy import or_
    unlabeled_row = (
        db.query(Transaction.month)
        .filter(
            or_(
                Transaction.category.is_(None),
                Transaction.category == "",
            )
        )
        .order_by(Transaction.month.desc())
        .first()
    )
    if unlabeled_row:
        try:
            mval = getattr(unlabeled_row, "month", None)
        except Exception:
            mval = unlabeled_row[0] if isinstance(unlabeled_row, (list, tuple)) else unlabeled_row
        if mval:
            return str(mval)

    # Fallback: absolute latest by date
    row = (
        db.query(Transaction.month, Transaction.date)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .first()
    )
    if not row:
        return None
    try:
        m = getattr(row, "month", None)
        d = getattr(row, "date", None)
    except Exception:
        m, d = row[0], row[1] if isinstance(row, (list, tuple)) and len(row) >= 2 else (None, None)
    if m:
        return str(m)
    return d.strftime("%Y-%m") if d else None

def _rule_matches_txn(rule: Rule, txn: Transaction) -> bool:
    """Extra safety when we match in-Python (primary filtering done in SQL)."""
    ok = True
    if rule.merchant:
        ok = ok and (txn.merchant or "").lower().find(rule.merchant.lower()) >= 0
    if rule.description:
        ok = ok and (txn.description or "").lower().find(rule.description.lower()) >= 0
    if rule.pattern:
        ok = ok and (rule.pattern.lower() in (txn.merchant or "").lower()
                    or rule.pattern.lower() in (txn.description or "").lower())
    return ok

def find_candidates(db: Session, month: str, rules: Iterable[Rule]) -> List[Transaction]:
    """
    Prefilter: unlabeled for the month. We’ll still guard per-rule in Python.
    """
    q = (
        db.query(Transaction)
          .filter(Transaction.month == month)
          .filter(is_unlabeled_expr())
    )
    return list(q.all())

def apply_all_active_rules(
    db: Session, month: str
) -> Tuple[int, int, List[Dict[str, Any]]]:
    """
    Returns: (applied, skipped, details[])
    details: [{id, rule_id, category}] for applied items
    """
    rules: List[Rule] = (
        db.query(Rule)
          .filter(Rule.active.is_(True))
          .order_by(Rule.id.asc())
          .all()
    )
    if not rules:
        return 0, 0, []

    txns = find_candidates(db, month, rules)
    applied = 0
    skipped = 0
    details: List[Dict[str, Any]] = []

    # Simple deterministic application: first matching rule wins.
    for t in txns:
        matched: Optional[Rule] = None
        for r in rules:
            if _rule_matches_txn(r, t):
                matched = r
                break
        if not matched:
            skipped += 1
            continue
        # Apply category
        t.category = matched.category
        applied += 1
        details.append({"id": t.id, "rule_id": matched.id, "category": matched.category})

    if applied:
        db.commit()

    return applied, skipped, details

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, List, Dict, Any

from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.orm_models import RuleSuggestion, Feedback, Transaction, Rule  # type: ignore


# Thresholds for promoting a candidate into a persistent suggestion
MIN_SUPPORT = 3
MIN_POSITIVE = 0.8
# In step 2, disable windowing to avoid NULL created_at issues in tests.
# We'll re-enable with a migration that guarantees created_at defaults.
WINDOW_DAYS = None


def canonicalize_merchant(name: str | None) -> str:
    """Lowercase, remove punctuation, collapse spaces.
    Keep this in sync with any frontend or ETL canonicalization logic.
    """
    if not name:
        return ""
    out = "".join(ch.lower() if (ch.isalnum() or ch.isspace()) else " " for ch in name)
    out = " ".join(out.split())
    return out


def compute_metrics(db: Session, merchant_norm: str, category: str) -> Optional[Tuple[int, float, datetime]]:
    """
    Compute (accepts, positive_rate, last_seen) using Python-side counting.

    - Join Feedback -> Transaction so we can canonicalize txn.merchant in Python.
    - Match rows where canonicalize_merchant(txn.merchant) == merchant_norm and
      lower(label) == category.lower().
    - accepts = count of Feedback.source == "accept" among matched rows
    - total = count of Feedback.source in {"accept","reject"} among matched rows; if no rejects stored, total == accepts
    - last_seen = max(created_at) among matched rows; fallback to now if none
    Windowing is disabled for Step 2.
    """
    rows = (
        db.query(Feedback, Transaction)
        .join(Transaction, Feedback.txn_id == Transaction.id)
        .all()
    )

    accepts = 0
    total = 0
    label_matches = 0
    last_seen: datetime | None = None
    cat_lower = (category or "").strip().lower()

    for fb, txn in rows:
        mnorm = canonicalize_merchant((getattr(txn, "merchant", None) or "").strip())
        if mnorm != merchant_norm:
            continue
        if (getattr(fb, "label", "") or "").strip().lower() != cat_lower:
            continue
        # Track label matches regardless of source for fallback behavior
        label_matches += 1

        src = (getattr(fb, "source", "") or "").strip().lower()
        if src in ("accept", "reject"):
            total += 1
        if src == "accept":
            accepts += 1

        ts = getattr(fb, "created_at", None)
        if ts is not None:
            last_seen = max(last_seen or ts, ts)

    if total == 0:
        # Fallback: when no explicit accept/reject stored, treat all matches as accepts
        if label_matches == 0:
            return None
        accepts = label_matches
        total = label_matches
    rate = accepts / total if total else 1.0
    return accepts, rate, (last_seen or datetime.now(timezone.utc))


def upsert_suggestion(
    db: Session,
    merchant_norm: str,
    category: str,
    support_count: int,
    positive_rate: float,
    last_seen: datetime,
) -> RuleSuggestion:
    row = (
        db.query(RuleSuggestion)
        .filter(RuleSuggestion.merchant_norm == merchant_norm)
        .filter(RuleSuggestion.category == category)
        .one_or_none()
    )
    if row is None:
        row = RuleSuggestion(
            merchant_norm=merchant_norm,
            category=category,
            support_count=support_count,
            positive_rate=positive_rate,
            last_seen=last_seen,
            ignored=False,
        )
        db.add(row)
    else:
        row.support_count = support_count
        row.positive_rate = positive_rate
        row.last_seen = last_seen
    db.flush()
    return row


def evaluate_candidate(db: Session, merchant_norm: str, category: str) -> Optional[RuleSuggestion]:
    """Return a (persisted) suggestion if thresholds are met, else None (no write)."""
    metrics = compute_metrics(db, merchant_norm, category)
    if not metrics:
        return None
    support_count, rate, last_seen = metrics
    if support_count < MIN_SUPPORT or rate < MIN_POSITIVE:
        return None

    # TODO: At a later step, add a coverage check to avoid suggesting categories
    # that are already enforced by an existing Rule.
    # Example:
    #   covered = db.query(Rule).filter(... pattern matches merchant_norm ...).first()
    #   if covered: return None

    return upsert_suggestion(db, merchant_norm, category, support_count, rate, last_seen)


# ---------------- Public service APIs for router ----------------------------
def list_suggestions(
    db: Session,
    merchant_norm: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    def _run_query(eq_match: bool) -> List[RuleSuggestion]:
        q = db.query(RuleSuggestion)
        if category:
            q = q.filter(func.lower(RuleSuggestion.category) == category.lower())
        if merchant_norm:
            if eq_match:
                q = q.filter(func.lower(RuleSuggestion.merchant_norm) == merchant_norm.lower())
            else:
                # fallback: token-wise contains ignoring purely numeric tokens
                canon = canonicalize_merchant(merchant_norm)
                likes = []
                for t in canon.split():
                    if t.isdigit():
                        continue
                    likes.append(RuleSuggestion.merchant_norm.ilike(f"%{t}%"))
                if likes:
                    q = q.filter(or_(*likes))
        # Prefer recent first; handle potential NULLs explicitly if supported
        try:
            q = q.order_by(RuleSuggestion.last_seen.desc().nullslast())
        except Exception:
            q = q.order_by(RuleSuggestion.last_seen.desc())
        return q.offset(int(offset)).limit(int(limit)).all()

    rows = _run_query(eq_match=True)
    if not rows and merchant_norm:
        rows = _run_query(eq_match=False)
    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append({
            "id": r.id,
            "merchant_norm": r.merchant_norm,
            "category": r.category,
            "support": getattr(r, "support_count", None) if hasattr(r, "support_count") else getattr(r, "support", None),
            "positive_rate": float(r.positive_rate or 0.0),
            "last_seen": (r.last_seen.isoformat() if getattr(r, "last_seen", None) else None),
            # optional created_at if present in schema
            "created_at": (getattr(r, "created_at").isoformat() if getattr(r, "created_at", None) else None),
        })
    return out


def accept_suggestion(db: Session, sug_id: int) -> Optional[int]:
    """Create a rule from suggestion and remove the suggestion. Returns rule id or None."""
    sug = db.get(RuleSuggestion, sug_id) if hasattr(db, "get") else db.query(RuleSuggestion).get(sug_id)  # type: ignore[attr-defined]
    if not sug:
        return None
    rule = Rule(
        pattern=sug.merchant_norm,
        target="category",
        category=sug.category,
    )
    db.add(rule)
    # Remove suggestion after accepting
    try:
        db.delete(sug)
    except Exception:
        pass
    db.commit()
    return rule.id


def dismiss_suggestion(db: Session, sug_id: int) -> bool:
    s = db.get(RuleSuggestion, sug_id) if hasattr(db, "get") else db.query(RuleSuggestion).get(sug_id)  # type: ignore[attr-defined]
    if not s:
        return False
    db.delete(s)
    db.commit()
    return True

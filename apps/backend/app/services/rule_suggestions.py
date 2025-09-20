from __future__ import annotations

from dataclasses import dataclass, asdict
import os
from datetime import datetime, timedelta
from app.utils.time import utc_now
from typing import List, Dict, Any, Optional, Tuple, Set

from sqlalchemy import func, and_, or_
from sqlalchemy.orm import Session

from app.orm_models import Transaction, Rule, Feedback
from app.orm_models import RuleSuggestion
from app.orm_models import RuleSuggestionIgnore as _RSI
from app.utils.text import canonicalize_merchant as _canonicalize


@dataclass
class Suggestion:
    merchant: str
    category: str
    count: int
    window_days: int
    sample_txn_ids: List[int]
    recent_month_key: Optional[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def get_config() -> Dict[str, Any]:
    """Expose config, reflecting environment variables when set.

    - RULE_SUGGESTION_WINDOW_DAYS: int; when 0, treated as None (no window)
    - RULE_SUGGESTION_MIN_SUPPORT: int
    - RULE_SUGGESTION_MIN_POSITIVE: float in [0,1]
    """
    wd = _env_int("RULE_SUGGESTION_WINDOW_DAYS", 60)
    window_days: Optional[int] = None if wd == 0 else wd
    return {
        "window_days": window_days,
        "min_support": _env_int("RULE_SUGGESTION_MIN_SUPPORT", 3),
        "min_positive": _env_float("RULE_SUGGESTION_MIN_POSITIVE", 0.8),
        "max_results": 25,
    }


def _recent_window(now: Optional[datetime], days: int) -> Tuple[datetime, datetime]:
    end = now or utc_now()
    start = end - timedelta(days=days)
    return start, end


def _active_rule_pairs(db: Session) -> Set[tuple[str | None, str]]:
    rows = (
        db.query(Rule.merchant, Rule.category)
        .filter(or_(Rule.active == True, Rule.active.is_(None)))
        .all()
    )
    return set((m, c) for m, c in rows if c)


# ---- Module config (reloadable via importlib.reload in tests) -------------
def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except Exception:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except Exception:
        return default


WINDOW_DAYS: int = _env_int("RULE_SUGGESTION_WINDOW_DAYS", 30)
MIN_SUPPORT: int = _env_int("RULE_SUGGESTION_MIN_SUPPORT", 3)
MIN_POSITIVE: float = _env_float("RULE_SUGGESTION_MIN_POSITIVE", 0.8)


def canonicalize_merchant(val: Optional[str]) -> Optional[str]:
    """Public helper used by tests and routers.

    Delegates to app.utils.text.canonicalize_merchant.
    """
    return _canonicalize(val)


def compute_metrics(
    db: Session,
    merchant_norm: str,
    category: str,
) -> Optional[Tuple[int, float, datetime]]:
    """Compute (accept_count, positive_rate, last_seen) for a merchant/category within window.

    Treat sources {accept, user_change, accept_suggestion, rule_apply} as positive; {reject} as negative.
    """
    if not merchant_norm or not category:
        return None

    start_dt, end_dt = _recent_window(None, WINDOW_DAYS)
    # Compare on dates to avoid flakiness at exact cutoff boundaries
    start_date = start_dt.date()
    end_date = end_dt.date()
    rows = (
        db.query(Feedback.created_at, Feedback.source, Transaction.merchant)
        .join(Transaction, Transaction.id == Feedback.txn_id)
        .filter(
            Feedback.label == category,
            func.date(Feedback.created_at) >= start_date,
            func.date(Feedback.created_at) <= end_date,
        )
        .all()
    )
    pos_sources = {"accept", "user_change", "accept_suggestion", "rule_apply"}
    neg_sources = {"reject"}
    pos = 0
    neg = 0
    last_seen: Optional[datetime] = None
    for created_at, source, merch in rows:
        mnorm = canonicalize_merchant(merch)
        if (mnorm or "") != merchant_norm:
            continue
        if source in pos_sources:
            pos += 1
            if last_seen is None or (created_at and created_at > last_seen):
                last_seen = created_at
        elif source in neg_sources:
            neg += 1

    total = pos + neg
    if total == 0:
        return None
    rate = float(pos) / float(total)
    return pos, rate, (last_seen or end_dt)


def evaluate_candidate(db: Session, merchant_norm: str, category: str) -> Optional[RuleSuggestion]:
    """Upsert RuleSuggestion based on recent feedback.

    Strategy:
    - Try to compute metrics from Feedback; if available, snapshot them onto the suggestion.
    - Otherwise, increment a per-(merchant_norm, category) counter (called on accept only).
    - Return the row only once thresholds are met; else return None.
    """
    now = utc_now()
    # Upsert row first so we can increment when metrics aren't derivable
    row = (
        db.query(RuleSuggestion)
        .filter(RuleSuggestion.merchant_norm == merchant_norm, RuleSuggestion.category == category)
        .one_or_none()
    )
    created = False
    if row is None:
        row = RuleSuggestion(merchant_norm=merchant_norm, category=category, support_count=0, positive_rate=1.0, last_seen=now)
        db.add(row)
        created = True

    # Try metrics from feedback
    metrics = compute_metrics(db, merchant_norm, category)
    if metrics:
        accepts, rate, last_seen = metrics
        row.support_count = int(accepts)
        row.positive_rate = float(rate)
        row.last_seen = last_seen
    else:
        # Incremental count on accept path (no reject info available here)
        try:
            row.support_count = int(getattr(row, "support_count", 0) or 0) + 1
        except Exception:
            row.support_count = 1
        row.positive_rate = 1.0
        row.last_seen = now

    db.flush()
    try:
        db.refresh(row)
    except Exception:
        pass

    if row.support_count >= MIN_SUPPORT and row.positive_rate >= MIN_POSITIVE:
        return row
    # If we just created the row and thresholds not met, keep it but return None
    return None


def mine_suggestions(
    db: Session,
    window_days: int = 60,
    min_count: int = 3,
    max_results: int = 25,
    exclude_merchants: Optional[List[str]] = None,
    exclude_categories: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Aggregate recent Feedback into merchant→category suggestions.

    Uses Feedback.label as the proposed category and joins Transaction for merchant.
    Skips pairs already covered by an active Rule and returns a few sample txn IDs.
    """
    exc_m = {m.lower() for m in (exclude_merchants or [])}
    exc_c = {c.lower() for c in (exclude_categories or [])}

    start, end = _recent_window(None, window_days)

    agg_q = (
        db.query(
            Transaction.merchant_canonical.label("mcanon"),
            Feedback.label.label("category"),
            func.count(Feedback.id).label("cnt"),
        )
        .join(Transaction, Transaction.id == Feedback.txn_id)
        .filter(
            and_(
                Feedback.created_at >= start,
                Feedback.created_at <= end,
                Transaction.merchant_canonical.isnot(None),
                Transaction.merchant_canonical != "",
                Feedback.label.isnot(None),
                Feedback.label != "",
            )
        )
    .group_by(Transaction.merchant_canonical, Feedback.label)
        .order_by(func.count(Feedback.id).desc(), Transaction.merchant_canonical.asc(), Feedback.label.asc())
    )

    rows = agg_q.all()
    if not rows:
        return []

    # DB-backed ignored pairs
    try:
        ignored_pairs: Set[Tuple[str, str]] = set(db.query(_RSI.merchant, _RSI.category).all())
    except Exception:
        ignored_pairs = set()

    def _base_canon(s: str) -> str:
        parts = [p for p in (s or "").split() if not p.isdigit()]
        return " ".join(parts) or s

    active_pairs = _active_rule_pairs(db)
    # First, merge counts by base canonical (strip numeric-only tokens)
    merged: Dict[Tuple[str, str], int] = {}
    for mcanon, category, cnt in rows:
        if not mcanon or not category:
            continue
        base = _base_canon(mcanon)
        key = (base, category)
        merged[key] = merged.get(key, 0) + int(cnt)

    suggestions: List[Suggestion] = []
    for (base_mcanon, category), cnt in merged.items():
        if int(cnt) < int(min_count or 0):
            continue
        if base_mcanon.lower() in exc_m or category.lower() in exc_c:
            continue
        if (base_mcanon, category) in active_pairs:
            continue
        if (base_mcanon, category) in ignored_pairs:
            continue

        sample_rows = (
            db.query(Transaction.id)
            .filter(
                and_(
                    or_(
                        Transaction.merchant_canonical == base_mcanon,
                        Transaction.merchant_canonical.like(f"{base_mcanon}%"),
                    ),
                    Transaction.date >= start.date(),
                    Transaction.date <= end.date(),
                )
            )
            .order_by(Transaction.date.desc(), Transaction.id.desc())
            .limit(5)
            .all()
        )
        sample_ids = [i for (i,) in sample_rows]

        recent_date = db.query(func.max(Transaction.date)).scalar()
        month_key = f"{recent_date.year:04d}-{recent_date.month:02d}" if recent_date else None

        suggestions.append(
            Suggestion(
                merchant=base_mcanon,
                category=category,
                count=int(cnt),
                window_days=window_days,
                sample_txn_ids=sample_ids,
                recent_month_key=month_key,
            )
        )

    best_by_merchant: Dict[str, Suggestion] = {}
    for s in suggestions:
        cur = best_by_merchant.get(s.merchant)
        if cur is None or s.count > cur.count:
            best_by_merchant[s.merchant] = s

    ordered = sorted(best_by_merchant.values(), key=lambda s: s.count, reverse=True)[:max_results]
    return [s.to_dict() for s in ordered]


# ---------------- Persistent suggestions (for existing router) --------------
def list_suggestions(
    db: Session,
    merchant_norm: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    q = db.query(RuleSuggestion)
    if merchant_norm:
        # Canonicalize incoming filter for robust matching
        mnorm = canonicalize_merchant(merchant_norm) or merchant_norm
        q = q.filter(func.lower(RuleSuggestion.merchant_norm) == mnorm.lower())
    if category:
        q = q.filter(func.lower(RuleSuggestion.category) == category.lower())
    try:
        q = q.order_by(RuleSuggestion.last_seen.desc().nullslast())
    except Exception:
        q = q.order_by(RuleSuggestion.last_seen.desc())
    rows = q.offset(int(offset)).limit(int(limit)).all()
    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append({
            "id": r.id,
            "merchant_norm": r.merchant_norm,
            "category": r.category,
            "support": getattr(r, "support_count", None),
            "positive_rate": float(getattr(r, "positive_rate", 0.0) or 0.0),
            "last_seen": (r.last_seen.isoformat() if getattr(r, "last_seen", None) else None),
        })
    return out


def accept_suggestion(db: Session, sug_id: int) -> Optional[int]:
    s = db.get(RuleSuggestion, sug_id)
    if not s:
        return None
    # Create a rule; for simplicity, use merchant_norm as pattern targeting merchant
    rule = Rule(
        merchant=s.merchant_norm,
        category=s.category,
        active=True,
    )
    db.add(rule)
    try:
        db.delete(s)
    except Exception:
        pass
    db.commit()
    return int(getattr(rule, "id", 0) or 0)


def dismiss_suggestion(db: Session, sug_id: int) -> bool:
    s = db.get(RuleSuggestion, sug_id)
    if not s:
        return False
    db.delete(s)
    db.commit()
    return True

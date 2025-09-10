# apps/backend/app/services/txns_nl_query.py
from __future__ import annotations
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from calendar import monthrange
from typing import Optional, Tuple, List, Dict, Any

from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from app.orm_models import Transaction  # assumes existing ORM model

# ---- helpers -----------------------------------------------------

def _month_bounds(year: int, month: int) -> Tuple[date, date]:
    last_day = monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)

def _this_month_bounds(today: date) -> Tuple[date, date]:
    return _month_bounds(today.year, today.month)

def _last_month_bounds(today: date) -> Tuple[date, date]:
    y, m = today.year, today.month - 1
    if m == 0:
        y -= 1
        m = 12
    return _month_bounds(y, m)

# ---- parsing -----------------------------------------------------

_CURRENCY = r"(?:\$?\s?([\d{1,3}(?:,\d{3})*]+(?:\.\d{1,2})?))"

@dataclass
class NLQuery:
    merchants: List[str]
    categories: List[str]
    start: Optional[date]
    end: Optional[date]
    min_amount: Optional[float]
    max_amount: Optional[float]
    intent: str  # "list" | "sum" | "count" | "top_merchants" | "top_categories"
    limit: int

DEFAULT_LIMIT = 50

def parse_nl_query(q: str, today: Optional[date] = None) -> NLQuery:
    """
    Rule-based parser for common finance intents:
    - time windows: "last month", "this month", "in July", "in July 2025", "between 2025-08-01 and 2025-08-31"
    - merchants: "Starbucks", "Amazon", comma-separated
    - categories: "groceries", "transport", etc. (single word tokens after 'category'/'categories' or 'on')
    - amounts: "over $50", "under 20", ">= 15", "<= $100"
    - intents: sum / total, count, list/show, top merchants/categories
    """
    today = today or date.today()
    q_low = q.lower().strip()

    # --- intent
    intent = "list"
    if re.search(r"\b(sum|total|how much|spent)\b", q_low):
        intent = "sum"
    if re.search(r"\b(count|how many|number of)\b", q_low):
        intent = "count"
    if re.search(r"\btop\s+(?:\d{1,3}\s*)?(?:merchant|merchants)\b", q_low):
        intent = "top_merchants"
    if re.search(r"\btop\s+(?:\d{1,3}\s*)?(?:category|categories)\b", q_low):
        intent = "top_categories"

    # --- quick time windows
    start = end = None
    if "last month" in q_low:
        start, end = _last_month_bounds(today)
    elif "this month" in q_low:
        start, end = _this_month_bounds(today)

    # --- extra intents
    if re.search(r"\baverage|avg\b", q_low):
        intent = "average"
    if re.search(r"\bby (day|daily)\b", q_low):
        intent = "by_day"
    if re.search(r"\bby (week|weekly)\b", q_low):
        intent = "by_week"
    if re.search(r"\bby (month|monthly)\b", q_low):
        intent = "by_month"

    # quick windows: MTD, YTD, WTD, since <date>, last N <units>
    if "mtd" in q_low:
        start = today.replace(day=1)
        end = today
    if "ytd" in q_low:
        start = date(today.year, 1, 1)
        end = today
    if "wtd" in q_low:
        # Monday as week start
        start = today - timedelta(days=today.weekday())
        end = today
    m = re.search(r"since\s+(\d{4}-\d{2}-\d{2})", q_low)
    if m:
        start = datetime.strptime(m.group(1), "%Y-%m-%d").date()
        end = today

    m = re.search(r"last\s+(\d{1,3})\s*(day|days|week|weeks|month|months)", q_low)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        if "day" in unit:
            start = today - timedelta(days=n)
        elif "week" in unit:
            start = today - timedelta(weeks=n)
        elif "month" in unit:
            # rough month delta
            start_year = today.year
            start_month = today.month - n
            while start_month <= 0:
                start_month += 12
                start_year -= 1
            start = _month_bounds(start_year, start_month)[0]
        end = today

    # in <Month> [Year]
    m = re.search(r"in\s+([a-zA-Z]+)\s*(\d{4})?", q_low)
    if m and start is None:
        try:
            month_name = m.group(1).title()
            year = int(m.group(2)) if m.group(2) else today.year
            month_num = datetime.strptime(month_name, "%B").month
            start, end = _month_bounds(year, month_num)
        except ValueError:
            pass

    # between YYYY-MM-DD and YYYY-MM-DD
    m = re.search(r"between\s+(\d{4}-\d{2}-\d{2})\s+(?:and|to)\s+(\d{4}-\d{2}-\d{2})", q_low)
    if m:
        start = datetime.strptime(m.group(1), "%Y-%m-%d").date()
        end = datetime.strptime(m.group(2), "%Y-%m-%d").date()

    # --- amounts
    min_amount = max_amount = None
    m = re.search(r"(over|>=|more than)\s*\$?\s*([\d,]+(?:\.\d{1,2})?)", q_low)
    if m:
        min_amount = float(m.group(2).replace(",", ""))
    m = re.search(r"(under|<=|less than)\s*\$?\s*([\d,]+(?:\.\d{1,2})?)", q_low)
    if m:
        max_amount = float(m.group(2).replace(",", ""))

    # --- merchants (naive): capture words after "from"/"at"/"merchant(s)" or quoted tokens
    merchants: List[str] = []
    merchants += re.findall(r'"([^"]+)"', q)  # quoted multi-word merchants (preserve case)

    def _clean_token(tok: str) -> str:
        # Remove trailing time/amount phrases and punctuation
        t = tok.strip().strip(",.?;:! ")
        lowers = t.lower()
        stopwords = [" last ", " this ", " between ", " in ", " over ", " under "]
        cut = len(lowers)
        for sw in stopwords:
            i = lowers.find(sw)
            if i != -1:
                cut = min(cut, i)
        t = t[:cut].strip().strip(",.?;:! ")
        return t

    m = re.search(r"(?:from|at|merchant|merchants)\s+([a-z0-9&\-\s,?]+)", q_low)
    if m:
        raw = m.group(1)
        for s in raw.split(","):
            cleaned = _clean_token(s)
            if cleaned:
                # restore basic capitalization heuristic if originally lower
                merchants.append(cleaned)

    # Remove tokens that are actually time/window keywords mistakenly captured
    if merchants:
        merchants = [
            t for t in merchants
            if not re.match(r"^(between|in|last|this)\b", t.strip().lower())
        ]

    # if user typed a single capitalized word, treat as merchant heuristic (e.g., "Starbucks")
    if not merchants:
        solo = re.findall(r"\b([A-Z][A-Za-z0-9&\-]{2,})\b", q)
        # filter obvious months
        months = {datetime(2000, m, 1).strftime("%B") for m in range(1,13)}
        merchants = [s for s in solo if s not in months]

    # --- categories
    categories: List[str] = []
    m = re.search(r"(?:category|categories|on)\s+([a-z\s,]+)", q_low)
    if m:
        categories += [c.strip(" ,") for c in m.group(1).split(",") if c.strip()]

    # --- limit
    limit = DEFAULT_LIMIT
    m = re.search(r"top\s+(\d{1,3})", q_low)
    if m:
        limit = min(200, int(m.group(1)))

    return NLQuery(
        merchants=merchants[:5],
        categories=categories[:5],
        start=start, end=end,
        min_amount=min_amount, max_amount=max_amount,
        intent=intent, limit=limit
    )

# ---- executor ----------------------------------------------------

def run_txn_query(db: Session, nlq: NLQuery) -> Dict[str, Any]:
    """
    Executes a deterministic, grounded query over transactions using parsed filters.
    Returns a standard shape: { intent, filters, result }
    """
    filters = []
    if nlq.start and nlq.end:
        filters.append(and_(Transaction.date >= nlq.start, Transaction.date <= nlq.end))
    if nlq.merchants:
        ors = []
        for m in nlq.merchants:
            # match either canonical or raw merchant
            ors.append(Transaction.merchant.ilike(f"%{m}%"))
            if hasattr(Transaction, "merchant_canonical"):
                # no .lower(); merchant_canonical should already be normalized
                ors.append(Transaction.merchant_canonical.ilike(f"%{m}%"))
        filters.append(or_(*ors))
    if nlq.categories:
        ors = [Transaction.category.ilike(f"%{c}%") for c in nlq.categories]
        filters.append(or_(*ors))
    if nlq.min_amount is not None:
        # amounts likely stored + for income, - for spend; normalize by abs for spend queries
        filters.append(func.abs(Transaction.amount) >= nlq.min_amount)
    if nlq.max_amount is not None:
        filters.append(func.abs(Transaction.amount) <= nlq.max_amount)
    # flow: expenses (negatives) / income (positives)
    flow = getattr(nlq, "flow", None)
    if flow == "expenses":
        filters.append(Transaction.amount < 0)
    elif flow == "income":
        filters.append(Transaction.amount > 0)

    # build base filter list once, then reuse
    q_filters = filters  # already a list

    if nlq.intent == "sum":
        q = db.query(func.sum(func.abs(Transaction.amount)))
        if q_filters:
            q = q.filter(*q_filters)
        total = q.scalar() or 0.0
        return {"intent": "sum", "filters": _filters_dump(nlq), "result": {"total_abs": float(total)}}

    if nlq.intent == "count":
        q = db.query(Transaction)
        if q_filters:
            q = q.filter(*q_filters)
        cnt = q.count()
        return {"intent": "count", "filters": _filters_dump(nlq), "result": {"count": cnt}}

    if nlq.intent == "average":
        q = db.query(func.avg(func.abs(Transaction.amount)))
        if q_filters:
            q = q.filter(*q_filters)
        avg_ = q.scalar() or 0.0
        return {"intent": "average", "filters": _filters_dump(nlq), "result": {"average_abs": float(avg_)}}

    # small helper to build series aggregations by a group expression
    def _series(group_expr, label_name: str):
        amt = func.sum(func.abs(Transaction.amount)).label("spend")
        q2 = db.query(group_expr.label(label_name), amt)
        if q_filters:
            q2 = q2.filter(*q_filters)
        rows = q2.group_by(group_expr).order_by(group_expr.asc()).all()
        return [{"bucket": getattr(r, label_name), "spend": float(getattr(r, "spend", 0) or 0)} for r in rows]

    if nlq.intent == "by_day":
        # Use SQLite strftime when available, else date() for portability
        dialect = getattr(getattr(db, "bind", None), "dialect", None)
        is_sqlite = bool(dialect and getattr(dialect, "name", "") == "sqlite")
        group = func.strftime("%Y-%m-%d", Transaction.date) if is_sqlite else func.date(Transaction.date)
        return {"intent": "by_day", "filters": _filters_dump(nlq), "result": _series(group, "day")}

    if nlq.intent == "by_week":
        dialect = getattr(getattr(db, "bind", None), "dialect", None)
        is_sqlite = bool(dialect and getattr(dialect, "name", "") == "sqlite")
        if is_sqlite:
            # Week number (Monday first) in SQLite
            group = func.strftime("%Y-W%W", Transaction.date)
        else:
            # ISO week in Postgres
            group = func.to_char(Transaction.date, 'IYYY-"W"IW')
        return {"intent": "by_week", "filters": _filters_dump(nlq), "result": _series(group, "week")}

    if nlq.intent == "by_month":
        dialect = getattr(getattr(db, "bind", None), "dialect", None)
        is_sqlite = bool(dialect and getattr(dialect, "name", "") == "sqlite")
        group = func.strftime("%Y-%m", Transaction.date) if is_sqlite else func.to_char(Transaction.date, "YYYY-MM")
        return {"intent": "by_month", "filters": _filters_dump(nlq), "result": _series(group, "month")}

    if nlq.intent == "top_merchants":
        merchant_col = func.coalesce(Transaction.merchant_canonical, Transaction.merchant).label("merchant")
        spend_col = func.sum(func.abs(Transaction.amount)).label("spend")

        q = db.query(merchant_col, spend_col)
        if q_filters:
            q = q.filter(*q_filters)

        rows = (q.group_by(merchant_col)
                 .order_by(spend_col.desc())
                 .limit(nlq.limit)
                 .all())

        # Filter out None merchants defensively and coerce to strings
        result = [
            {"merchant": (r.merchant or "(Unknown)"), "spend": float(r.spend or 0)}
            for r in rows
            if r.merchant is not None
        ]
        return {"intent": "top_merchants", "filters": _filters_dump(nlq), "result": result}

    if nlq.intent == "top_categories":
        cat_col = Transaction.category.label("category")
        spend_col = func.sum(func.abs(Transaction.amount)).label("spend")

        q = db.query(cat_col, spend_col)
        if q_filters:
            q = q.filter(*q_filters)

        rows = (q.group_by(cat_col)
                 .order_by(spend_col.desc())
                 .limit(nlq.limit)
                 .all())

        result = [
            {"category": (r.category or "(Uncategorized)"), "spend": float(r.spend or 0)}
            for r in rows
            if r.category is not None
        ]
        return {"intent": "top_categories", "filters": _filters_dump(nlq), "result": result}

    # default: list
    q = db.query(Transaction)
    if q_filters:
        q = q.filter(*q_filters)
    # pagination
    page = getattr(nlq, "page", 1) if hasattr(nlq, "page") else 1
    page_size = getattr(nlq, "page_size", nlq.limit) if hasattr(nlq, "page_size") else nlq.limit
    items = (q.order_by(Transaction.date.desc())
               .offset((page - 1) * page_size)
               .limit(page_size)
               .all())
    filters_dump = _filters_dump(nlq)
    filters_dump.update({"page": page, "page_size": page_size})
    return {"intent": "list", "filters": filters_dump, "result": [_txn_dump(t) for t in items]}

def _txn_dump(t: Transaction) -> Dict[str, Any]:
    return {
        "id": t.id,
        "date": t.date.isoformat() if t.date else None,
        "merchant": t.merchant,
        "category": t.category,
        "amount": float(t.amount),
        "description": t.description,
        "merchant_canonical": getattr(t, "merchant_canonical", None),
    }

def _filters_dump(nlq: NLQuery) -> Dict[str, Any]:
    return {
        "merchants": nlq.merchants,
        "categories": nlq.categories,
        "start": nlq.start.isoformat() if nlq.start else None,
        "end": nlq.end.isoformat() if nlq.end else None,
        "min_amount": nlq.min_amount,
        "max_amount": nlq.max_amount,
        "intent": nlq.intent,
        "limit": nlq.limit,
    }

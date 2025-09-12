from typing import List, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.orm_models import RuleSuggestionIgnore as RSI
from app.utils.ttl_cache import TTLCache

_CACHE = TTLCache()
_CACHE_KEY = "rule_suggestion_ignores"

def list_ignores(db: Session) -> List[Dict]:
    rows = db.query(RSI).order_by(RSI.merchant.asc(), RSI.category.asc()).all()
    return [{"merchant": r.merchant, "category": r.category} for r in rows]

def list_ignores_cached(db: Session, ttl_seconds: int = 60) -> List[Dict]:
    """Return cached list of ignores for a short TTL window."""
    return _CACHE.get(_CACHE_KEY, ttl_seconds, lambda: list_ignores(db))

def add_ignore(db: Session, merchant: str, category: str) -> List[Dict]:
    row = db.query(RSI).filter(and_(RSI.merchant == merchant, RSI.category == category)).one_or_none()
    if not row:
        db.add(RSI(merchant=merchant, category=category))
        db.commit()
    _CACHE.invalidate(_CACHE_KEY)
    return list_ignores(db)

def remove_ignore(db: Session, merchant: str, category: str) -> List[Dict]:
    row = db.query(RSI).filter(and_(RSI.merchant == merchant, RSI.category == category)).one_or_none()
    if row:
        db.delete(row); db.commit()
    _CACHE.invalidate(_CACHE_KEY)
    return list_ignores(db)

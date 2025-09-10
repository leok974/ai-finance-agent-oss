from typing import List, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.orm_models import RuleSuggestionIgnore as RSI

def list_ignores(db: Session) -> List[Dict]:
    rows = db.query(RSI).order_by(RSI.merchant.asc(), RSI.category.asc()).all()
    return [{"merchant": r.merchant, "category": r.category} for r in rows]

def add_ignore(db: Session, merchant: str, category: str) -> List[Dict]:
    row = db.query(RSI).filter(and_(RSI.merchant == merchant, RSI.category == category)).one_or_none()
    if not row:
        db.add(RSI(merchant=merchant, category=category))
        db.commit()
    return list_ignores(db)

def remove_ignore(db: Session, merchant: str, category: str) -> List[Dict]:
    row = db.query(RSI).filter(and_(RSI.merchant == merchant, RSI.category == category)).one_or_none()
    if row:
        db.delete(row); db.commit()
    return list_ignores(db)

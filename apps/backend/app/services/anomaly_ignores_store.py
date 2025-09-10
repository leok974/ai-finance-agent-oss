from typing import List
from sqlalchemy.orm import Session
from app.orm_models import AnomalyIgnore

def list_ignores(db: Session) -> List[str]:
    return [r.category for r in db.query(AnomalyIgnore).order_by(AnomalyIgnore.category.asc()).all()]

def add_ignore(db: Session, category: str) -> List[str]:
    cat = category.strip()
    row = db.query(AnomalyIgnore).filter(AnomalyIgnore.category == cat).one_or_none()
    if not row:
        db.add(AnomalyIgnore(category=cat))
        db.commit()
    return list_ignores(db)

def remove_ignore(db: Session, category: str) -> List[str]:
    cat = category.strip()
    row = db.query(AnomalyIgnore).filter(AnomalyIgnore.category == cat).one_or_none()
    if row:
        db.delete(row); db.commit()
    return list_ignores(db)

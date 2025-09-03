from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from app.db import get_db
from app.models import Rule as RuleSchema
from app.orm_models import RuleORM
# from app.schemas import RuleIn  # optional: use a separate schema for input

router = APIRouter()


@router.get("")
def list_rules(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    rows = db.execute(select(RuleORM).order_by(RuleORM.id.desc())).scalars().all()
    return [
        {"id": r.id, "pattern": r.pattern, "target": r.target, "category": r.category}
        for r in rows
    ]


@router.post("")
def add_rule(rule: RuleSchema, db: Session = Depends(get_db)):
    r = RuleORM(pattern=rule.pattern, target=rule.target, category=rule.category)
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"ok": True, "id": r.id, "rule": {"pattern": r.pattern, "target": r.target, "category": r.category}}


@router.delete("")
def clear_rules(db: Session = Depends(get_db)):
    db.execute(delete(RuleORM))
    db.commit()
    return {"ok": True}


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    res = db.execute(delete(RuleORM).where(RuleORM.id == rule_id))
    if getattr(res, "rowcount", 0) == 0:
        raise HTTPException(status_code=404, detail="not found")
    db.commit()
    return {"ok": True}

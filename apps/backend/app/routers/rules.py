from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from app.db import get_db
from app.models import Rule as RuleSchema
from app.orm_models import Rule
from app.orm_models import Transaction
from pydantic import BaseModel
# from app.schemas import RuleIn  # optional: use a separate schema for input

router = APIRouter()


@router.get("")
def list_rules(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    rows = db.execute(select(Rule).order_by(Rule.id.desc())).scalars().all()
    return [
        {"id": r.id, "pattern": r.pattern, "target": r.target, "category": r.category}
        for r in rows
    ]


@router.post("")
def add_rule(rule: RuleSchema, db: Session = Depends(get_db)):
    r = Rule(pattern=rule.pattern, target=rule.target, category=rule.category)
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"ok": True, "id": r.id, "rule": {"pattern": r.pattern, "target": r.target, "category": r.category}}


@router.delete("")
def clear_rules(db: Session = Depends(get_db)):
    db.execute(delete(Rule))
    db.commit()
    return {"ok": True}


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    res = db.execute(delete(Rule).where(Rule.id == rule_id))
    if getattr(res, "rowcount", 0) == 0:
        raise HTTPException(status_code=404, detail="not found")
    db.commit()
    return {"ok": True}


# --- Minimal test endpoint (used by web RuleTesterPanel) ---------------------
class RuleInput(BaseModel):
    name: str
    enabled: bool = True
    when: Dict[str, Any]
    then: Dict[str, Any]


@router.post("/test")
def test_rule(body: RuleInput, db: Session = Depends(get_db)):
    """
    Test a rule-like seed against transactions.
    Currently supports: when.description_like (case-insensitive LIKE)
    Returns: { matched_count: int, sample: [ {id,date,merchant,description,amount,category}, ... ] }
    """
    q = db.query(Transaction)
    desc_like = (body.when or {}).get("description_like") if body.when else None
    if desc_like:
        like = f"%{desc_like}%"
        q = q.filter(Transaction.description.ilike(like))

    # Count total matches (without limit)
    total = q.count()

    # Fetch a small sample for display
    rows = q.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(10).all()
    sample = [
        dict(
            id=r.id,
            date=str(getattr(r, "date", "")),
            merchant=getattr(r, "merchant", None),
            description=getattr(r, "description", None),
            amount=float(getattr(r, "amount", 0.0) or 0.0),
            category=getattr(r, "category", None),
        )
        for r in rows
    ]

    return {"matched_count": total, "sample": sample}

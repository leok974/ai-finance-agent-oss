from fastapi import APIRouter, Depends, HTTPException
from app.utils.csrf import csrf_protect
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session
from app.db import get_db
from app.orm_models import Rule

router = APIRouter(prefix="/agent/tools/rules", tags=["agent_tools.rules"])

class RuleIn(BaseModel):
    merchant: Optional[str] = None
    description: Optional[str] = None
    pattern: Optional[str] = None
    category: str = Field(..., min_length=1)
    active: Optional[bool] = True

class RuleOut(RuleIn):
    id: int

@router.get("", response_model=List[RuleOut])
def list_rules(db: Session = Depends(get_db)):
    rows = db.query(Rule).order_by(Rule.id.desc()).all()
    return [RuleOut(**{
        "id": r.id, "merchant": r.merchant, "description": r.description,
        "pattern": r.pattern, "category": r.category, "active": r.active
    }) for r in rows]

@router.post("", response_model=RuleOut, dependencies=[Depends(csrf_protect)])
def create_rule(body: RuleIn, db: Session = Depends(get_db)):
    row = Rule(
        merchant=body.merchant, description=body.description,
        pattern=body.pattern, category=body.category, active=True if body.active is None else body.active
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return RuleOut(id=row.id, merchant=row.merchant, description=row.description,
                   pattern=row.pattern, category=row.category, active=row.active)

@router.put("/{rule_id}", response_model=RuleOut, dependencies=[Depends(csrf_protect)])
def update_rule(rule_id: int, body: RuleIn, db: Session = Depends(get_db)):
    row = db.get(Rule, rule_id)
    if not row:
        raise HTTPException(404, "Rule not found")
    for f in ("merchant","description","pattern","category","active"):
        v = getattr(body, f)
        if v is not None or f in ("category","active"):
            setattr(row, f, v)
    db.commit()
    db.refresh(row)
    return RuleOut(id=row.id, merchant=row.merchant, description=row.description,
                   pattern=row.pattern, category=row.category, active=row.active)

@router.delete("/{rule_id}", dependencies=[Depends(csrf_protect)])
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    row = db.get(Rule, rule_id)
    if not row:
        raise HTTPException(404, "Rule not found")
    db.delete(row)
    db.commit()
    return {"status":"ok","deleted":rule_id}

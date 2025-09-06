from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from app.db import get_db
from pydantic import BaseModel, ConfigDict
from app.orm_models import Rule
from app.orm_models import Transaction
# from app.schemas import RuleIn  # optional: use a separate schema for input

router = APIRouter()

class CompatRuleInput(BaseModel):
    """Liberal rule input accepting extra keys and a flexible shape.
    Expected keys from web: name, enabled, when{ description_like? }, then{ category }
    """
    model_config = ConfigDict(extra="allow")
    name: str
    enabled: bool = True
    when: Dict[str, Any] = {}
    then: Dict[str, Any] = {}

def map_to_orm_fields(body: CompatRuleInput) -> Dict[str, Any]:
    """Map compat input to our ORM Rule fields (pattern/target/category/active)."""
    when = body.when or {}
    then = body.then or {}
    category = then.get("category")
    if not category:
        raise HTTPException(status_code=422, detail="then.category is required")

    # Prefer description_like, fallback merchant[_like]
    target = None
    pattern = None
    if isinstance(when, dict):
        if when.get("description_like"):
            target = "description"
            pattern = str(when.get("description_like"))
        elif when.get("merchant_like"):
            target = "merchant"
            pattern = str(when.get("merchant_like"))
        elif when.get("merchant"):
            target = "merchant"
            pattern = str(when.get("merchant"))

    return {
        "pattern": pattern,
        "target": target,
        "category": category,
        "active": bool(body.enabled),
    }


@router.get("")
def list_rules(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    rows = db.execute(select(Rule).order_by(Rule.id.desc())).scalars().all()
    # Present rules in the new web shape: {id, name, enabled, when, then}
    out: List[Dict[str, Any]] = []
    for r in rows:
        when: Dict[str, Any] = {}
        if r.target == "description" and r.pattern:
            when = {"description_like": r.pattern}
        elif r.target == "merchant" and r.pattern:
            when = {"merchant_like": r.pattern}
        name = f"{r.target or 'rule'}:{r.pattern}" if r.pattern else (getattr(r, "pattern", None) or "Unnamed rule")
        out.append({
            "id": r.id,
            "name": name,
            "enabled": bool(getattr(r, "active", True)),
            "when": when,
            "then": {"category": r.category},
        })
    return out


@router.post("")
def add_rule(body: CompatRuleInput = Body(...), db: Session = Depends(get_db)):
    fields = map_to_orm_fields(body)
    r = Rule(pattern=fields.get("pattern"), target=fields.get("target"), category=fields["category"], active=fields.get("active", True))
    db.add(r)
    db.commit()
    db.refresh(r)
    # Return in the new shape
    return {
        "id": r.id,
        "name": f"{r.target or 'rule'}:{r.pattern}" if r.pattern else "Unnamed rule",
        "enabled": bool(getattr(r, "active", True)),
        "when": ({"description_like": r.pattern} if r.target == "description" and r.pattern else ({"merchant_like": r.pattern} if r.target == "merchant" and r.pattern else {})),
        "then": {"category": r.category},
    }


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
def test_rule(
    body: RuleInput,
    db: Session = Depends(get_db),
    month: Optional[str] = Query(None, description="YYYY-MM; defaults to all months if omitted"),
):
    """
    Test a rule-like seed against transactions.
    Currently supports: when.description_like (case-insensitive LIKE)
    Returns: { matched_count: int, sample: [ {id,date,merchant,description,amount,category}, ... ] }
    """
    q = db.query(Transaction)
    if month:
        q = q.filter(Transaction.month == month)
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

    return {"matched_count": total, "sample": sample, "month": month}
